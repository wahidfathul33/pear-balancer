/**
 * Turns the complete logbook context for a period into the exact activity
 * descriptions required by an already-generated schedule.
 *
 * The schedule remains the source of truth for dates and activity codes.
 * The AI only synthesizes the wording from the complete logbook context.
 */
import { chatComplete, loadAiConfigFromEnv, ChatMessage, isBadRequestError } from "./ai-client";
import { KETERANGAN_MAP } from "./data";
import {
  extractEntriesArray,
  generateLogbook,
  LogbookEntry,
} from "./logbook";
import { ScheduledTask } from "./scheduler";

const BACKUP_ID = 5090;

const INDONESIAN_MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

const BACKUP_ACTIVITIES = [
  "Melaksanakan backup database aplikasi CDC ke media penyimpanan yang tersedia pada server lokal.",
  "Mengamankan data aplikasi SIMPEG dengan melakukan pencadangan basis data ke server lokal.",
  "Melakukan proses backup database aplikasi SIM-PAK ke sistem penyimpanan pada server lokal.",
  "Menjalankan pencadangan data aplikasi SPPD melalui media penyimpanan server lokal.",
  "Melaksanakan proses backup basis data aplikasi SIMBMU sebagai bagian dari pengamanan data pada server lokal.",
  "Melakukan backup database aplikasi Persediaan ke fasilitas penyimpanan server lokal.",
  "Menjalankan proses pencadangan data aplikasi Tracer pada media penyimpanan server lokal.",
];

export interface UraianRow {
  tanggal: string;
  id: number;
  uraian: string;
  jumlahOutput: number;
  needsManual: boolean;
}

export interface GenerateUraianJadwalOptions {
  scheduled: ScheduledTask[];
  commitStartDate: Date;
  commitEndDate: Date;
  projectRefs: string[];
  /** Reuse the result from Generate Logbook when the browser has a matching cache. */
  logbookEntries?: LogbookEntry[];
}

export interface GenerateUraianJadwalResult {
  rows: UraianRow[];
  contextEntryCount: number;
  contextSource: "logbook-cache" | "gitlab";
}

interface TargetSlot {
  slot: number;
  tanggal: string;
  id: number;
}

interface GeneratedTarget {
  slot?: number;
  id?: number;
  uraian?: string;
  deskripsi?: string;
}

/**
 * Generate every scheduled row. Existing Generate Logbook output is preferred
 * so both features use exactly the same evidence; otherwise it is generated
 * from GitLab once on the server.
 */
export async function generateUraianJadwal(
  options: GenerateUraianJadwalOptions
): Promise<GenerateUraianJadwalResult> {
  const suppliedEntries = options.logbookEntries?.filter(isUsableLogbookEntry) ?? [];
  const contextSource = suppliedEntries.length > 0 ? "logbook-cache" : "gitlab";
  const contextEntries =
    suppliedEntries.length > 0
      ? suppliedEntries
      : (
          await generateLogbook({
            startDate: options.commitStartDate,
            endDate: options.commitEndDate,
            projectRefs: options.projectRefs,
          })
        ).entries;

  const targets: TargetSlot[] = options.scheduled
    .map((task, slot) => ({ slot, tanggal: task.tanggal, id: task.id }))
    .filter((target) => target.id !== BACKUP_ID);

  if (targets.length > 0 && contextEntries.length === 0) {
    throw new Error(
      "Tidak ada konteks logbook pada rentang tanggal dan repo tersebut. Generate logbook terlebih dahulu atau pilih rentang yang memiliki perubahan GitLab."
    );
  }

  const generatedBySlot = await synthesizeTargets(targets, contextEntries);
  let backupCursor = 0;

  const rows = options.scheduled.map((task, slot): UraianRow => {
    const target = { slot, tanggal: task.tanggal, id: task.id };
    const baseUraian =
      task.id === BACKUP_ID
        ? backupActivityAt(backupCursor++)
        : generatedBySlot.get(slot) ?? fallbackUraian(target, contextEntries);
    const uraian = finalizeUraian(baseUraian, target, contextEntries);

    return {
      tanggal: task.tanggal,
      id: task.id,
      uraian,
      jumlahOutput: 1,
      needsManual: false,
    };
  });

  return {
    rows,
    contextEntryCount: contextEntries.length,
    contextSource,
  };
}

function isUsableLogbookEntry(entry: LogbookEntry): boolean {
  return Boolean(
    entry &&
      typeof entry.tanggal === "string" &&
      typeof entry.id === "number" &&
      typeof entry.deskripsi === "string" &&
      entry.deskripsi.trim()
  );
}

function backupActivityAt(index: number): string {
  if (index < BACKUP_ACTIVITIES.length) return BACKUP_ACTIVITIES[index];
  const cycle = Math.floor(index / BACKUP_ACTIVITIES.length) + 1;
  const base = BACKUP_ACTIVITIES[index % BACKUP_ACTIVITIES.length].replace(/\.$/, "");
  return `${base} untuk siklus pencadangan ke-${cycle}.`;
}

/**
 * A target is a requested perspective on the complete body of work, not a
 * one-to-one assignment to a single commit. This is what lets the same real
 * feature support an implementation, operation, maintenance, and evaluation
 * description without leaving schedule rows empty.
 */
async function synthesizeTargets(
  targets: TargetSlot[],
  contextEntries: LogbookEntry[]
): Promise<Map<number, string>> {
  const generated = new Map<number, string>();
  if (targets.length === 0) return generated;

  const aiConfig = loadAiConfigFromEnv();
  const messages = buildSynthesisPrompt(targets, contextEntries);

  // Enforce JSON output where the provider supports it; disable via
  // AI_JSON_OBJECT=false for models that reject the param.
  const wantJsonObject = process.env.AI_JSON_OBJECT !== "false";

  try {
    let raw: string;
    if (wantJsonObject) {
      try {
        raw = await chatComplete(aiConfig, messages, { temperature: 0.2, jsonObject: true });
      } catch (err) {
        // Retry without response_format only on a 4xx (param rejected), not
        // on timeouts/5xx — otherwise a slow call is paid for twice.
        if (!isBadRequestError(err)) throw err;
        raw = await chatComplete(aiConfig, messages, { temperature: 0.2 });
      }
    } else {
      raw = await chatComplete(aiConfig, messages, { temperature: 0.2 });
    }

    const parsed = extractEntriesArray(raw) as GeneratedTarget[];
    const targetsBySlot = new Map(targets.map((target) => [target.slot, target]));
    const usedDescriptions = new Set<string>();

    for (const item of parsed) {
      if (!Number.isInteger(item?.slot)) continue;
      const target = targetsBySlot.get(item.slot as number);
      if (!target || item.id !== target.id || generated.has(target.slot)) continue;

      const description = (item.uraian ?? item.deskripsi ?? "").trim();
      const duplicateKey = description.toLocaleLowerCase("id-ID");
      if (!description || usedDescriptions.has(duplicateKey)) continue;

      generated.set(target.slot, description);
      usedDescriptions.add(duplicateKey);
    }
  } catch {
    // The deterministic, context-grounded fallback below guarantees that a
    // partial/invalid model response never turns into empty schedule rows.
  }

  targets.forEach((target, index) => {
    if (!generated.has(target.slot)) {
      generated.set(target.slot, fallbackUraian(target, contextEntries, index));
    }
  });

  return generated;
}

function buildSynthesisPrompt(
  targets: TargetSlot[],
  contextEntries: LogbookEntry[]
): ChatMessage[] {
  const requestedCounts = new Map<number, number>();
  for (const target of targets) {
    requestedCounts.set(target.id, (requestedCounts.get(target.id) ?? 0) + 1);
  }

  const requestSummary = [...requestedCounts.entries()]
    .map(([id, count]) => `${id} — ${KETERANGAN_MAP[id] ?? "Kegiatan"}: ${count} uraian`)
    .join("\n");

  const system: ChatMessage = {
    role: "system",
    content: [
      "Peran: Anda menyusun uraian aktivitas jadwal kerja ASN bidang sistem informasi dari konteks logbook yang sudah diringkas.",
      "Tujuan: sintesis SELURUH konteks menjadi uraian tingkat kegiatan yang utuh, lalu isi tepat satu uraian untuk setiap slot target.",
      `Jumlah yang harus dipenuhi:\n${requestSummary}`,
      [
        "Makna kategori:",
        "540: rumuskan bahan rencana, kebutuhan, rancangan, dan tahapan sebelum/untuk mendasari implementasi yang tampak dalam konteks.",
        "5088: jelaskan pengoperasian atau konfigurasi fitur yang sudah tersedia agar dapat digunakan administrator/pengguna.",
        "5089: jelaskan pengujian/evaluasi perilaku nyata dari fitur, layout, alur, atau hasil perubahan.",
        "5091: jelaskan pemeliharaan, penyesuaian, perapian, atau penyempurnaan sistem yang sudah berjalan.",
        "5092: susun laporan hasil pekerjaan pada konteks untuk disampaikan kepada atasan.",
        "5093: susun petunjuk/dokumentasi teknis pengoperasian fitur dan konfigurasi pada konteks.",
        "5094: rangkum pembuatan/pengembangan program atau fitur sebagai satu hasil implementasi yang utuh.",
      ].join("\n"),
      [
        "Kriteria berhasil:",
        "- keluaran berjumlah persis sama dengan jumlah slot target; slot dan id tidak boleh diubah",
        "- setiap uraian satu kalimat kerja aktif dalam Bahasa Indonesia dan tidak boleh kosong",
        "- gabungkan beberapa entri yang saling terkait menjadi uraian tingkat kegiatan; jangan sekadar menyalin satu perubahan file",
        "- bukti yang sama boleh dipakai untuk kategori berbeda jika sudut kegiatannya memang berbeda, misalnya implementasi, pengoperasian, pemeliharaan, dan evaluasi",
        "- uraian pada id yang sama harus berbeda fokus, bukan parafrasa berulang",
        "- gunakan hanya fitur, modul, aplikasi, dan pekerjaan yang didukung konteks; jangan mengarang pekerjaan baru",
        "- setiap uraian wajib menyebut nama aplikasi/repo yang relevan secara eksplisit sesuai field aplikasi pada konteks",
        "- tanggal target hanya penempatan jadwal dan tidak membatasi tanggal asli entri yang boleh disintesis",
        "- jangan menambahkan tanggal ke uraian; server akan menambahkan tanggal task dari slot target secara deterministik",
      ].join("\n"),
      "Balas hanya dengan objek JSON valid berskema: {\"entries\":[{\"slot\":0,\"id\":540,\"uraian\":\"...\"}]}",
    ].join("\n\n"),
  };

  const compactContext = contextEntries.map((entry, index) => ({
    index,
    tanggal: entry.tanggal,
    kode_asal: entry.id,
    kategori_asal: entry.keterangan,
    deskripsi: entry.deskripsi,
    aplikasi: getEntryAppNames(entry),
    files: entry.files.slice(0, 8),
  }));

  const user: ChatMessage = {
    role: "user",
    content: [
      `Slot target:\n${JSON.stringify(targets, null, 2)}`,
      `Konteks lengkap hasil Generate Logbook (${contextEntries.length} entri):\n${JSON.stringify(compactContext, null, 2)}`,
    ].join("\n\n"),
  };

  return [system, user];
}

/** Last-resort wording grounded in a real logbook description. */
function fallbackUraian(
  target: TargetSlot,
  contextEntries: LogbookEntry[],
  ordinal = target.slot
): string {
  if (target.id === 5092) {
    return "Menyampaikan laporan hasil pekerjaan terkait pengembangan dan pemeliharaan aplikasi kepada atasan sebagai pertanggungjawaban pelaksanaan tugas.";
  }

  const sameCategory = contextEntries.filter((entry) => entry.id === target.id);
  const candidates = sameCategory.length > 0 ? sameCategory : contextEntries;
  const source = candidates[ordinal % candidates.length]?.deskripsi?.trim().replace(/\.$/, "");
  const evidence = source || "pengembangan dan pengelolaan sistem informasi pada periode berjalan";

  const prefixes: Record<number, string> = {
    540: "Menyiapkan bahan rencana pengelolaan sistem dengan merumuskan kebutuhan dan tahapan pekerjaan berdasarkan konteks",
    5088: "Mengoperasikan sistem informasi dengan menjalankan serta memastikan fungsi hasil pekerjaan",
    5089: "Melakukan evaluasi sistem informasi dengan menguji fungsi dan hasil pekerjaan",
    5091: "Memelihara dan merawat sistem informasi melalui penyesuaian serta penyempurnaan pekerjaan",
    5093: "Menyusun petunjuk dan dokumentasi pengoperasian program berdasarkan konfigurasi dan alur pekerjaan",
    5094: "Membuat dan mengembangkan program sistem informasi dengan mengintegrasikan hasil pekerjaan",
  };

  return `${prefixes[target.id] ?? KETERANGAN_MAP[target.id] ?? "Melaksanakan kegiatan"}: ${evidence}.`;
}

/** Returns structured app names, with a cache-compatible fallback for older logbook entries. */
function getEntryAppNames(entry: LogbookEntry): string[] {
  const structured = entry.appNames?.map((name) => name.trim()).filter(Boolean) ?? [];
  if (structured.length > 0) return [...new Set(structured)];

  const trailingParenthetical = entry.deskripsi.match(/\(([^()]+)\)\s*\.?\s*$/)?.[1];
  if (!trailingParenthetical) return [];

  return [
    ...new Set(
      trailingParenthetical
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean)
    ),
  ];
}

function appNamesForTarget(
  target: TargetSlot,
  contextEntries: LogbookEntry[]
): string[] {
  const sameCategory = contextEntries.filter((entry) => entry.id === target.id);
  const candidates = sameCategory.length > 0 ? sameCategory : contextEntries;
  if (candidates.length === 0) return [];

  for (let offset = 0; offset < candidates.length; offset++) {
    const entry = candidates[(target.slot + offset) % candidates.length];
    const names = getEntryAppNames(entry);
    if (names.length > 0) return names;
  }

  return [];
}

function ensureAppName(
  description: string,
  appNames: string[]
): string {
  const trimmed = description.trim();
  if (appNames.length === 0) return trimmed;

  const normalizedDescription = trimmed.toLocaleLowerCase("id-ID");
  const alreadyMentionsApp = appNames.some((name) =>
    normalizedDescription.includes(name.toLocaleLowerCase("id-ID"))
  );
  if (alreadyMentionsApp) return trimmed;

  const sentence = trimmed.replace(/[.\s]+$/, "");
  return `${sentence} pada aplikasi ${appNames.join(", ")}.`;
}

function formatIndonesianDate(dateString: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) return dateString;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return dateString;

  return `${day} ${INDONESIAN_MONTHS[month - 1]} ${year}`;
}

function appendTaskDate(description: string, taskDate: string): string {
  const monthPattern = INDONESIAN_MONTHS.join("|");
  const existingDateSuffix = new RegExp(
    `\\s*\\(\\d{1,2}\\s+(?:${monthPattern})\\s+\\d{4}\\)\\.?\\s*$`,
    "i"
  );
  const sentence = description
    .replace(existingDateSuffix, "")
    .trim()
    .replace(/[.\s]+$/, "");

  return `${sentence}. (${formatIndonesianDate(taskDate)})`;
}

function finalizeUraian(
  description: string,
  target: TargetSlot,
  contextEntries: LogbookEntry[]
): string {
  const withAppName =
    target.id === BACKUP_ID
      ? description.trim()
      : ensureAppName(description, appNamesForTarget(target, contextEntries));

  return appendTaskDate(withAppName, target.tanggal);
}
