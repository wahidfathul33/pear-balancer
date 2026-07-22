"use client";

import { useState, useCallback, useEffect } from "react";
import { WeekPicker, getMondayOfWeek, getFridayOfWeek, toLocalISODate } from "@/app/components/WeekPicker";
import { ProjectPicker } from "@/app/components/ProjectPicker";
import type { LogbookEntry } from "@/lib/logbook";

const CACHE_KEY = "logbook-cache-v1";

interface LogbookMeta {
  unitCount: number;
  fileCount: number;
  rawChangeCount: number;
}

interface LogbookCache {
  startDate: string;
  endDate: string;
  projectRefs: string[];
  entries: LogbookEntry[];
  meta: LogbookMeta;
}

function getDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  return days[d.getDay()];
}

function downloadCSV(entries: LogbookEntry[]) {
  const header = "tanggal,id,keterangan,deskripsi,files";
  const rows = entries.map(
    (e) =>
      `${e.tanggal},${e.id},"${e.keterangan.replace(/"/g, '""')}","${e.deskripsi.replace(/"/g, '""')}","${e.files.join(" | ").replace(/"/g, '""')}"`
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "logbook.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function LogbookPage() {
  const [startDate, setStartDate] = useState<Date>(() => getMondayOfWeek(new Date()));
  const [endDate, setEndDate] = useState<Date>(() => getFridayOfWeek(new Date()));
  const [projectRefs, setProjectRefs] = useState<string[]>([]);
  const [entries, setEntries] = useState<LogbookEntry[] | null>(null);
  const [meta, setMeta] = useState<LogbookMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Rehydrate the last generated result from cache so it survives a reload.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const cached: LogbookCache = JSON.parse(raw);
      setStartDate(new Date(`${cached.startDate}T00:00:00`));
      setEndDate(new Date(`${cached.endDate}T00:00:00`));
      setProjectRefs(cached.projectRefs || []);
      setEntries(cached.entries);
      setMeta(cached.meta);
    } catch {
      // corrupt/unavailable cache — ignore, start fresh
    }
  }, []);

  const handleDateRangeChange = (start: Date, end: Date) => {
    setStartDate(start);
    setEndDate(end);
  };

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    // Keep showing the previous (cached) result while a new one loads —
    // it should only disappear once a new generate actually succeeds.
    try {
      const res = await fetch("/api/logbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: toLocalISODate(startDate),
          endDate: toLocalISODate(endDate),
          projectRefs,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal generate logbook");
      const newMeta: LogbookMeta = {
        unitCount: data.unitCount,
        fileCount: data.fileCount,
        rawChangeCount: data.rawChangeCount,
      };
      setEntries(data.entries);
      setMeta(newMeta);
      try {
        const cache: LogbookCache = {
          startDate: toLocalISODate(startDate),
          endDate: toLocalISODate(endDate),
          projectRefs,
          entries: data.entries,
          meta: newMeta,
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      } catch {
        // storage full/unavailable — non-fatal, just skip caching
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan tidak diketahui");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, projectRefs]);

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Generate Logbook</h1>
          <p className="text-sm text-gray-500 mt-1">
            Mengambil perubahan git dari git.uns.ac.id
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Rentang Tanggal
              </label>
              <WeekPicker startDate={startDate} endDate={endDate} onChange={handleDateRangeChange} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Repo
              </label>
              <ProjectPicker selected={projectRefs} onChange={setProjectRefs} />
            </div>
          </div>
          <div className="mt-4">
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold rounded-lg px-6 py-2 text-sm transition-colors"
            >
              {loading ? "Mengambil & meringkas…" : "Generate Logbook"}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {entries && meta && (
          <>
            <div className="bg-white rounded-2xl shadow p-4 flex flex-wrap gap-6 items-center text-sm text-gray-600">
              <div><span className="font-semibold text-gray-800">{meta.rawChangeCount}</span> perubahan file mentah</div>
              <div><span className="font-semibold text-gray-800">{meta.unitCount}</span> unit logbook (setelah penggabungan)</div>
              <div><span className="font-semibold text-gray-800">{meta.fileCount}</span> file unik tersentuh</div>
              <div><span className="font-semibold text-gray-800">{entries.length}</span> entri logbook</div>
            </div>

            <div className="bg-white rounded-2xl shadow overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h2 className="text-base font-semibold text-gray-700">Logbook ({entries.length} entri)</h2>
                <button
                  onClick={() => downloadCSV(entries)}
                  className="bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg px-4 py-2 transition-colors"
                >
                  Download CSV
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">#</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Hari</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tanggal</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">ID</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Keterangan (Kategori)</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Deskripsi Pekerjaan</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">File</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {entries.map((e, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 transition-colors align-top">
                        <td className="px-6 py-3 text-gray-400">{idx + 1}</td>
                        <td className="px-6 py-3 text-gray-600">{getDayLabel(e.tanggal)}</td>
                        <td className="px-6 py-3 font-mono text-gray-700">{e.tanggal}</td>
                        <td className="px-6 py-3 font-medium text-gray-800">{e.id}</td>
                        <td className="px-6 py-3 text-gray-600 max-w-xs">{e.keterangan}</td>
                        <td className="px-6 py-3 text-gray-700 max-w-md">{e.deskripsi}</td>
                        <td className="px-6 py-3 text-gray-500 font-mono text-xs max-w-xs">
                          {e.files.join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {entries && entries.length === 0 && !error && (
          <div className="bg-white rounded-2xl shadow p-6 text-sm text-gray-500 text-center">
            Tidak ada perubahan yang ditemukan untuk rentang tanggal ini.
          </div>
        )}
      </div>
    </main>
  );
}
