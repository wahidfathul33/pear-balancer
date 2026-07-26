export interface Task {
  id: number;
  bobot: number;
  prioritas: number | null;
  keterangan: string;
}

/**
 * One category row within a pattern. Within a single pattern every occurrence
 * of an id shares the same bobot/prioritas, so instead of repeating identical
 * rows we store the id once with a `count` the user can raise or lower.
 * `expandPattern` turns this back into the flat Task[] the scheduler consumes.
 */
export interface PatternRow {
  id: number;
  bobot: number;
  prioritas: number | null;
  count: number;
}

export const KETERANGAN_MAP: Record<number, string> = {
  540: "Menyiapkan rencana pengembangan sistem informasi atau jaringan",
  5088: "Mengoperasikan sistem informasi atau jaringan",
  5089: "Melakukan evaluasi sistem informasi atau jaringan",
  5090: "Melakukan back up data sistem informasi atau jaringan",
  5091: "Memelihara dan merawat sistem informasi atau jaringan",
  5092: "Menyusun laporan hasil pelaksanaan tugas kepada atasan sebagai pertanggung jawaban",
  5093: "Menyusun petunjuk dan dokumentasi peng-operasian program",
  5094: "Pembuatan program sistem informasi atau jaringan",
};

export const DEFAULT_PATTERN_1: PatternRow[] = [
  { id: 540, bobot: 2, prioritas: 1, count: 1 },
  { id: 5088, bobot: 1, prioritas: 0, count: 3 },
  { id: 5089, bobot: 1, prioritas: 5, count: 3 },
  { id: 5090, bobot: 0.5, prioritas: 0, count: 7 },
  { id: 5091, bobot: 1, prioritas: 4, count: 3 },
  { id: 5092, bobot: 1, prioritas: 6, count: 1 },
  { id: 5093, bobot: 6, prioritas: 3, count: 1 },
  { id: 5094, bobot: 6, prioritas: 2, count: 1 },
];

export const DEFAULT_PATTERN_2: PatternRow[] = [
  { id: 540, bobot: 2, prioritas: 1, count: 1 },
  { id: 5088, bobot: 1, prioritas: 0, count: 4 },
  { id: 5089, bobot: 1, prioritas: 4, count: 5 },
  { id: 5090, bobot: 0.5, prioritas: 0, count: 7 },
  { id: 5091, bobot: 1, prioritas: 3, count: 6 },
  { id: 5092, bobot: 1, prioritas: 5, count: 1 },
  { id: 5094, bobot: 6, prioritas: 2, count: 1 },
];

/** Deep-copies a pattern so editing the UI copy never mutates the defaults. */
export function clonePattern(rows: PatternRow[]): PatternRow[] {
  return rows.map((row) => ({ ...row }));
}

/** Expands per-category counts into the flat Task[] the scheduler consumes. Rows with count 0 contribute nothing. */
export function expandPattern(rows: PatternRow[]): Task[] {
  const tasks: Task[] = [];
  for (const row of rows) {
    for (let i = 0; i < row.count; i++) {
      tasks.push({
        id: row.id,
        bobot: row.bobot,
        prioritas: row.prioritas,
        keterangan: KETERANGAN_MAP[row.id] ?? "",
      });
    }
  }
  return tasks;
}
