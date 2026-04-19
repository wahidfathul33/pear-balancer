export interface Task {
  id: number;
  bobot: number;
  prioritas: number | null;
  keterangan: string;
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

export const PATTERN_1: Task[] = [
  { id: 540, bobot: 2, prioritas: 1, keterangan: KETERANGAN_MAP[540] },
  { id: 5088, bobot: 1, prioritas: 0, keterangan: KETERANGAN_MAP[5088] },
  { id: 5088, bobot: 1, prioritas: 0, keterangan: KETERANGAN_MAP[5088] },
  { id: 5088, bobot: 1, prioritas: 0, keterangan: KETERANGAN_MAP[5088] },
  { id: 5089, bobot: 1, prioritas: 5, keterangan: KETERANGAN_MAP[5089] },
  { id: 5089, bobot: 1, prioritas: 5, keterangan: KETERANGAN_MAP[5089] },
  { id: 5089, bobot: 1, prioritas: 5, keterangan: KETERANGAN_MAP[5089] },
  { id: 5090, bobot: 0.5, prioritas: 0, keterangan: KETERANGAN_MAP[5090] },
  { id: 5090, bobot: 0.5, prioritas: 0, keterangan: KETERANGAN_MAP[5090] },
  { id: 5090, bobot: 0.5, prioritas: 0, keterangan: KETERANGAN_MAP[5090] },
  { id: 5090, bobot: 0.5, prioritas: 0, keterangan: KETERANGAN_MAP[5090] },
  { id: 5090, bobot: 0.5, prioritas: 0, keterangan: KETERANGAN_MAP[5090] },
  { id: 5090, bobot: 0.5, prioritas: 0, keterangan: KETERANGAN_MAP[5090] },
  { id: 5090, bobot: 0.5, prioritas: 0, keterangan: KETERANGAN_MAP[5090] },
  { id: 5091, bobot: 1, prioritas: 4, keterangan: KETERANGAN_MAP[5091] },
  { id: 5091, bobot: 1, prioritas: 4, keterangan: KETERANGAN_MAP[5091] },
  { id: 5091, bobot: 1, prioritas: 4, keterangan: KETERANGAN_MAP[5091] },
  { id: 5092, bobot: 1, prioritas: 6, keterangan: KETERANGAN_MAP[5092] },
  { id: 5093, bobot: 6, prioritas: 3, keterangan: KETERANGAN_MAP[5093] },
  { id: 5094, bobot: 6, prioritas: 2, keterangan: KETERANGAN_MAP[5094] },
];

export const PATTERN_2: Task[] = [
  { id: 540, bobot: 2, prioritas: 1, keterangan: KETERANGAN_MAP[540] },
  { id: 5088, bobot: 1, prioritas: 0, keterangan: KETERANGAN_MAP[5088] },
  { id: 5088, bobot: 1, prioritas: 0, keterangan: KETERANGAN_MAP[5088] },
  { id: 5088, bobot: 1, prioritas: 0, keterangan: KETERANGAN_MAP[5088] },
  { id: 5088, bobot: 1, prioritas: 0, keterangan: KETERANGAN_MAP[5088] },
  { id: 5089, bobot: 1, prioritas: 4, keterangan: KETERANGAN_MAP[5089] },
  { id: 5089, bobot: 1, prioritas: 4, keterangan: KETERANGAN_MAP[5089] },
  { id: 5089, bobot: 1, prioritas: 4, keterangan: KETERANGAN_MAP[5089] },
  { id: 5089, bobot: 1, prioritas: 4, keterangan: KETERANGAN_MAP[5089] },
  { id: 5089, bobot: 1, prioritas: 4, keterangan: KETERANGAN_MAP[5089] },
  { id: 5090, bobot: 0.5, prioritas: 0, keterangan: KETERANGAN_MAP[5090] },
  { id: 5090, bobot: 0.5, prioritas: 0, keterangan: KETERANGAN_MAP[5090] },
  { id: 5090, bobot: 0.5, prioritas: 0, keterangan: KETERANGAN_MAP[5090] },
  { id: 5090, bobot: 0.5, prioritas: 0, keterangan: KETERANGAN_MAP[5090] },
  { id: 5090, bobot: 0.5, prioritas: 0, keterangan: KETERANGAN_MAP[5090] },
  { id: 5090, bobot: 0.5, prioritas: 0, keterangan: KETERANGAN_MAP[5090] },
  { id: 5090, bobot: 0.5, prioritas: 0, keterangan: KETERANGAN_MAP[5090] },
  { id: 5091, bobot: 1, prioritas: 3, keterangan: KETERANGAN_MAP[5091] },
  { id: 5091, bobot: 1, prioritas: 3, keterangan: KETERANGAN_MAP[5091] },
  { id: 5091, bobot: 1, prioritas: 3, keterangan: KETERANGAN_MAP[5091] },
  { id: 5091, bobot: 1, prioritas: 3, keterangan: KETERANGAN_MAP[5091] },
  { id: 5091, bobot: 1, prioritas: 3, keterangan: KETERANGAN_MAP[5091] },
  { id: 5091, bobot: 1, prioritas: 3, keterangan: KETERANGAN_MAP[5091] },
  { id: 5092, bobot: 1, prioritas: 5, keterangan: KETERANGAN_MAP[5092] },
  { id: 5094, bobot: 6, prioritas: 2, keterangan: KETERANGAN_MAP[5094] },
];
