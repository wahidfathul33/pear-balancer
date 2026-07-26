import { KETERANGAN_MAP } from "./data";
import { fetchFileChanges, loadGitlabConfigFromEnv, GitFileChange } from "./gitlab";
import { chatComplete, loadAiConfigFromEnv, ChatMessage, AiConfig } from "./ai-client";

/** id 5090 (backup) is excluded from AI-generated logbook classification. */
const DEFAULT_EXCLUDED_IDS = [5090];

/** "Memelihara dan merawat sistem informasi atau jaringan" */
const MAINTENANCE_ID = 5091;
/** "Melakukan evaluasi sistem informasi atau jaringan" — every maintenance/fix must be verified by testing. */
const TESTING_ID = 5089;

function loadExcludedIds(): number[] {
  const raw = process.env.LOGBOOK_EXCLUDED_IDS;
  if (!raw) return DEFAULT_EXCLUDED_IDS;
  const parsed = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
  return parsed.length > 0 ? parsed : DEFAULT_EXCLUDED_IDS;
}

/** Below this many changed (+/-) lines, a file's diff is considered "small" and merged with siblings from the same day. */
function loadSmallChangeThreshold(): number {
  const raw = Number(process.env.LOGBOOK_SMALL_CHANGE_THRESHOLD);
  return Number.isFinite(raw) && raw > 0 ? raw : 15;
}

/** Cap on characters of diff text sent to the AI per unit, to keep prompts bounded. */
const MAX_DIFF_CHARS_PER_UNIT = 3000;

export interface LogbookUnit {
  tanggal: string;
  files: string[];
  projects: string[];
  appNames: string[];
  commitTitles: string[];
  changedLines: number;
  diffExcerpt: string;
  merged: boolean;
}

export interface LogbookEntry {
  tanggal: string;
  id: number;
  keterangan: string;
  deskripsi: string;
  files: string[];
  /** Human-readable GitLab application/repository names that support this entry. */
  appNames?: string[];
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "\n… (dipotong)" : text;
}

/**
 * Groups raw file changes by date. Within a date, changes at/above the
 * threshold stay as their own unit; changes below it are merged together
 * into a single combined unit so tiny edits don't each burn a full logbook
 * line.
 */
export function buildLogbookUnits(
  changes: GitFileChange[],
  smallChangeThreshold: number
): LogbookUnit[] {
  const byDate = new Map<string, GitFileChange[]>();
  for (const c of changes) {
    if (!byDate.has(c.date)) byDate.set(c.date, []);
    byDate.get(c.date)!.push(c);
  }

  const units: LogbookUnit[] = [];

  for (const [date, dayChanges] of [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const big = dayChanges.filter((c) => c.changedLines >= smallChangeThreshold);
    const small = dayChanges.filter((c) => c.changedLines < smallChangeThreshold);

    for (const c of big) {
      units.push({
        tanggal: date,
        files: [c.path],
        projects: [c.project],
        appNames: [c.appName],
        commitTitles: [c.commitTitle],
        changedLines: c.changedLines,
        diffExcerpt: truncate(`--- ${c.path} ---\n${c.diff}`, MAX_DIFF_CHARS_PER_UNIT),
        merged: false,
      });
    }

    if (small.length > 0) {
      const combinedDiff = small
        .map((c) => `--- ${c.path} (${c.appName}) ---\n${c.diff}`)
        .join("\n\n");
      units.push({
        tanggal: date,
        files: small.map((c) => c.path),
        projects: [...new Set(small.map((c) => c.project))],
        appNames: [...new Set(small.map((c) => c.appName))],
        commitTitles: [...new Set(small.map((c) => c.commitTitle))],
        changedLines: small.reduce((s, c) => s + c.changedLines, 0),
        diffExcerpt: truncate(combinedDiff, MAX_DIFF_CHARS_PER_UNIT),
        merged: small.length > 1,
      });
    }
  }

  return units;
}

export function buildAllowedKeteranganMap(excludedIds: number[]): Record<number, string> {
  const allowed: Record<number, string> = {};
  for (const [idStr, text] of Object.entries(KETERANGAN_MAP)) {
    const id = Number(idStr);
    if (!excludedIds.includes(id)) allowed[id] = text;
  }
  return allowed;
}

/**
 * Practical decision criteria per KETERANGAN_MAP id, so the model picks a
 * category based on what the diff actually shows instead of defaulting to
 * whichever id it saw most recently.
 */
export const CATEGORY_CRITERIA: Record<number, string> = {
  540: "Perencanaan/perancangan SEBELUM implementasi — dokumen rencana, desain, atau proposal fitur. Pilih ini HANYA jika diff berisi dokumen perencanaan/desain, BUKAN kode.",
  5088: "Mengoperasikan sistem yang sudah ada — menjalankan/memantau tools operasional (mis. memantau log Sentry, menjalankan sinkronisasi data terjadwal, menelusuri masalah akun/login user). Bukan mengubah kode aplikasi.",
  5089: "Melakukan pengetesan/evaluasi atas perubahan yang sudah dibuat — menguji query, endpoint, atau alur untuk memastikan hasilnya sesuai ekspektasi. Fokus pada VERIFIKASI hasil, bukan menulis kode baru.",
  5091: "Memelihara/merawat sistem yang sudah berjalan — memperbaiki bug, mengubah konfigurasi, menyesuaikan query/model/kode YANG SUDAH ADA. Bukan membangun fitur baru dari nol.",
  5092: "Menyusun laporan hasil pekerjaan untuk disampaikan ke atasan. Pilih HANYA jika ada bukti pembuatan laporan itu sendiri, bukan pekerjaan teknisnya.",
  5093: "Menyusun petunjuk penggunaan/dokumentasi teknis (README, dokumentasi API, panduan modul). Pilih HANYA jika diff berupa file dokumentasi, bukan kode program.",
  5094: "Pembuatan program/modul/fitur BARU — menambahkan file, class, endpoint, atau fitur yang SEBELUMNYA BELUM ADA. Ini implementasi awal, bukan perbaikan atas fitur lama.",
};

function buildPrompt(units: LogbookUnit[], allowedMap: Record<number, string>): ChatMessage[] {
  const categoryGuide = Object.entries(allowedMap)
    .map(([idStr, text]) => {
      const id = Number(idStr);
      const criteria = CATEGORY_CRITERIA[id];
      return criteria ? `${id} — ${text}\n  Kriteria: ${criteria}` : `${id} — ${text}`;
    })
    .join("\n\n");

  const system: ChatMessage = {
    role: "system",
    content: [
      "Anda adalah asisten yang membuat logbook harian pekerjaan IT (sistem informasi/jaringan) dari riwayat perubahan git.",
      "Untuk SETIAP item input, pilih SATU id kategori berdasarkan SIFAT perubahan pada diff — jangan pernah memilih id yang sama untuk semua item hanya karena item sebelumnya memakai id itu. Setiap item dinilai independen dari isi diff-nya sendiri. Daftar kategori dan kriterianya:",
      categoryGuide,
      "Tulis deskripsi singkat (1 kalimat, Bahasa Indonesia, kalimat kerja aktif) yang menjelaskan pekerjaan nyata berdasarkan nama file, nama fungsi/class, dan isi diff yang diberikan — sebutkan detail teknis spesifik (nama file/modul/fitur) agar deskripsi antar item berbeda-beda sesuai konteksnya masing-masing, jangan mengarang, dan jangan gunakan kalimat generik yang bisa berlaku untuk item manapun.",
      `Jika id yang dipilih untuk suatu item adalah ${MAINTENANCE_ID} (Memelihara dan merawat), WAJIB sertakan juga field "deskripsi_pengetesan" pada objek yang sama: satu kalimat spesifik tentang FITUR/FUNGSI apa yang diuji ulang setelah perbaikan itu (contoh: "Menguji ulang proses login untuk memastikan token JWT dikembalikan dengan benar setelah perbaikan actionLogin"). JANGAN memakai kalimat generik seperti "melakukan pengetesan terhadap file X" — jelaskan perilaku/fitur konkret yang diverifikasi, bukan sekadar menyebut nama file. Untuk item dengan id selain ${MAINTENANCE_ID}, field ini boleh dihilangkan.`,
      "Jika beberapa file digabung dalam satu item, ringkas menjadi satu deskripsi yang mencakup keseluruhan perubahan tersebut.",
      "Balas HANYA dengan satu objek JSON valid, tanpa markdown fence, tanpa teks penjelasan apa pun sebelum atau sesudahnya, dengan skema persis:",
      '{"entries": [{"tanggal": "YYYY-MM-DD", "id": <int>, "deskripsi": "<string>", "deskripsi_pengetesan": "<string, opsional>"}]}',
      "Array \"entries\" harus punya urutan dan jumlah elemen yang sama persis dengan jumlah item input, satu objek output per item input.",
    ].join("\n\n"),
  };

  const userItems = units.map((u, idx) => ({
    index: idx,
    tanggal: u.tanggal,
    files: u.files,
    jumlah_baris_berubah: u.changedLines,
    pesan_commit: u.commitTitles,
    diff: u.diffExcerpt,
  }));

  const user: ChatMessage = {
    role: "user",
    content: `Berikut daftar perubahan yang perlu diklasifikasikan menjadi entri logbook:\n\n${JSON.stringify(userItems, null, 2)}`,
  };

  return [system, user];
}

/**
 * Finds the end index (inclusive) of the bracketed value starting at
 * `start` by tracking bracket depth of just `open`/`close` while respecting
 * string literals/escapes. Any brackets of the *other* type encountered
 * along the way belong to properly-nested sibling structures and don't
 * affect this count — every JSON open has a matching close of its own type.
 */
function findMatchingBracketEnd(text: string, start: number, open: string, close: string): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === open) {
      depth += 1;
    } else if (ch === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function stripFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced ? fenced[1] : text;
}

/** Parses `{"entries": [...]}` , tolerating a bare `[...]` array as a fallback for models/providers that ignore the object-schema instruction. */
export function extractEntriesArray(text: string): unknown[] {
  const candidate = stripFence(text);

  const objStart = candidate.indexOf("{");
  if (objStart !== -1) {
    const objEnd = findMatchingBracketEnd(candidate, objStart, "{", "}");
    if (objEnd !== -1) {
      try {
        const parsed = JSON.parse(candidate.slice(objStart, objEnd + 1));
        if (Array.isArray(parsed?.entries)) return parsed.entries;
      } catch {
        // fall through to bare-array handling below
      }
    }
  }

  const arrStart = candidate.indexOf("[");
  if (arrStart !== -1) {
    const arrEnd = findMatchingBracketEnd(candidate, arrStart, "[", "]");
    if (arrEnd !== -1) {
      try {
        const parsed = JSON.parse(candidate.slice(arrStart, arrEnd + 1));
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // fall through to error below
      }
    }
  }

  const preview = text.slice(0, 400);
  throw new Error(`Respons AI tidak mengandung JSON yang valid. Cuplikan respons: ${preview}`);
}

export interface ClassifiedUnit {
  id: number;
  deskripsi: string;
  deskripsiPengetesan?: string;
}

/**
 * Sends `units` to the AI for classification into one KETERANGAN_MAP id each,
 * with a matching one-sentence description. Returns one ClassifiedUnit per
 * input unit, in the same order.
 */
export async function classifyUnits(
  units: LogbookUnit[],
  allowedMap: Record<number, string>,
  aiConfig: AiConfig
): Promise<ClassifiedUnit[]> {
  if (units.length === 0) return [];

  const messages = buildPrompt(units, allowedMap);

  let raw: string;
  try {
    // Ask the provider to enforce valid JSON output where supported — this
    // eliminates most stray-prose/markdown-fence parsing failures outright.
    raw = await chatComplete(aiConfig, messages, { jsonObject: true });
  } catch {
    // Some models/providers reject the response_format param entirely;
    // retry without it and rely on the tolerant extractor below.
    raw = await chatComplete(aiConfig, messages);
  }

  const parsed = extractEntriesArray(raw) as Array<{
    tanggal?: string;
    id?: number;
    deskripsi?: string;
    deskripsi_pengetesan?: string;
  }>;

  return units.map((unit, idx) => {
    const item = parsed[idx];
    const id = item?.id !== undefined && allowedMap[item.id] ? item.id : fallbackId(allowedMap);
    const baseDeskripsi = item?.deskripsi?.trim() || `Perubahan pada ${unit.files.join(", ")}`;
    return {
      id,
      // Raw description, WITHOUT the app-name suffix — callers decide
      // whether/how to append it (e.g. generateLogbook appends it once per
      // entry, including the derived testing companion entry).
      deskripsi: baseDeskripsi,
      deskripsiPengetesan: item?.deskripsi_pengetesan?.trim(),
    };
  });
}

export interface GenerateLogbookOptions {
  startDate: Date;
  endDate: Date;
  /** Project refs (ids or paths) picked from the starred-projects dropdown; falls back to GITLAB_PROJECT_IDS from .env if omitted. */
  projectRefs?: string[];
}

export interface GenerateLogbookResult {
  entries: LogbookEntry[];
  unitCount: number;
  fileCount: number;
  rawChangeCount: number;
}

/**
 * Full pipeline: pull the user's git changes down to file level, merge
 * small diffs per day, then ask the AI (via OpenRouter) to turn each unit
 * into a logbook entry using KETERANGAN_MAP as the category context
 * (excluding id 5090). Entirely stateless — nothing is written to a
 * database; everything lives only in the returned object.
 */
export async function generateLogbook(
  options: GenerateLogbookOptions
): Promise<GenerateLogbookResult> {
  const gitlabConfig = loadGitlabConfigFromEnv();
  const aiConfig = loadAiConfigFromEnv();
  const excludedIds = loadExcludedIds();
  const smallChangeThreshold = loadSmallChangeThreshold();
  const allowedMap = buildAllowedKeteranganMap(excludedIds);

  const changes = await fetchFileChanges(
    gitlabConfig,
    options.startDate,
    options.endDate,
    options.projectRefs
  );
  if (changes.length === 0) {
    return { entries: [], unitCount: 0, fileCount: 0, rawChangeCount: 0 };
  }

  const units = buildLogbookUnits(changes, smallChangeThreshold);
  const classified = await classifyUnits(units, allowedMap, aiConfig);

  const entries: LogbookEntry[] = [];
  units.forEach((unit, idx) => {
    const { id, deskripsi: baseDeskripsi, deskripsiPengetesan } = classified[idx];
    const tanggal = unit.tanggal;

    entries.push({
      tanggal,
      id,
      keterangan: allowedMap[id],
      deskripsi: appendAppName(baseDeskripsi, unit.appNames),
      files: unit.files,
      appNames: unit.appNames,
    });

    // Setiap perbaikan/perawatan (5091) wajib diverifikasi lewat pengetesan,
    // jadi otomatis tambahkan entri evaluasi (5089) pendampingnya. Deskripsi
    // pengetesan diambil dari penjelasan AI (spesifik per fitur), bukan
    // kalimat generik yang hanya menyebut nama file.
    if (id === MAINTENANCE_ID && allowedMap[TESTING_ID]) {
      const testingDeskripsi = deskripsiPengetesan || deriveTestingDeskripsi(baseDeskripsi);
      entries.push({
        tanggal,
        id: TESTING_ID,
        keterangan: allowedMap[TESTING_ID],
        deskripsi: appendAppName(testingDeskripsi, unit.appNames),
        files: unit.files,
        appNames: unit.appNames,
      });
    }
  });

  return {
    entries,
    unitCount: units.length,
    fileCount: new Set(changes.map((c) => c.path)).size,
    rawChangeCount: changes.length,
  };
}

/**
 * Fallback when the AI doesn't supply `deskripsi_pengetesan`: rephrases the
 * maintenance description into a testing sentence instead of falling back
 * to a generic "melakukan pengetesan terhadap file X" — since it's built
 * from the actual fix summary, it still names the real feature/behavior
 * involved and varies per entry.
 */
function deriveTestingDeskripsi(baseDeskripsi: string): string {
  const trimmed = baseDeskripsi.trim();
  if (!trimmed) return "Menguji ulang perubahan yang telah dilakukan";
  const lowerFirst = trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
  return `Menguji ulang hasil dari ${lowerFirst}`;
}

/** Appends the app/repo name(s) to the end of a description, e.g. "Perbaikan bug login (ekepeg)". */
function appendAppName(deskripsi: string, appNames: string[]): string {
  if (appNames.length === 0) return deskripsi;
  const text = deskripsi.replace(/\s+$/, "");
  return `${text} (${appNames.join(", ")})`;
}

/** Best-effort fallback when the model returns an id outside the allowed set. */
function fallbackId(allowedMap: Record<number, string>): number {
  const ids = Object.keys(allowedMap).map(Number);
  // Prefer 5094 (pembuatan program) if present — most commits are code changes.
  return ids.includes(5094) ? 5094 : ids[0];
}
