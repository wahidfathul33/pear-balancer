"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { PATTERN_1, PATTERN_2, Task, KETERANGAN_MAP } from "@/lib/data";
import { generateSchedule } from "@/lib/scheduler";
import { WeekPicker, getMondayOfWeek, getFridayOfWeek, toLocalISODate } from "@/app/components/WeekPicker";
import { ProjectPicker } from "@/app/components/ProjectPicker";
import type { LogbookEntry } from "@/lib/logbook";

type PatternKey = "1" | "2";

const PATTERNS: Record<PatternKey, Task[]> = {
  "1": PATTERN_1,
  "2": PATTERN_2,
};

const LOGBOOK_CACHE_KEY = "logbook-cache-v1";
const URAIAN_JADWAL_CACHE_KEY = "uraian-jadwal-cache-v1";

interface UraianRow {
  tanggal: string;
  id: number;
  uraian: string;
  jumlahOutput: number;
  needsManual: boolean;
}

interface ResultContext {
  entryCount: number;
  source: "logbook-cache" | "gitlab";
}

interface ResultParams {
  startDate: string;
  endDate: string;
  pattern: PatternKey;
  projectRefs: string[];
}

interface UraianJadwalCache extends ResultParams {
  rows: UraianRow[];
  resultContext: ResultContext;
}

interface CachedLogbook {
  startDate: string;
  endDate: string;
  projectRefs: string[];
  entries: LogbookEntry[];
}

function matchingCachedLogbook(
  startDate: string,
  endDate: string,
  projectRefs: string[]
): LogbookEntry[] | undefined {
  try {
    const raw = localStorage.getItem(LOGBOOK_CACHE_KEY);
    if (!raw) return undefined;

    const cached = JSON.parse(raw) as CachedLogbook;
    const selectedRefs = [...projectRefs].sort();
    const cachedRefs = [...(cached.projectRefs ?? [])].sort();
    const sameRepos =
      selectedRefs.length === cachedRefs.length &&
      selectedRefs.every((ref, index) => ref === cachedRefs[index]);

    if (
      cached.startDate !== startDate ||
      cached.endDate !== endDate ||
      !sameRepos ||
      !Array.isArray(cached.entries) ||
      cached.entries.length === 0
    ) {
      return undefined;
    }

    return cached.entries;
  } catch {
    return undefined;
  }
}

/** Textarea that grows to fit its content instead of scrolling/clipping, so the full uraian is always visible. */
function AutoGrowTextarea({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={1}
      className={className}
    />
  );
}

function getDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  return days[d.getDay()];
}

function downloadCSV(rows: UraianRow[]) {
  const header = "Tanggal,Kode Kegiatan,Uraian Aktivitas,Jumlah Output";
  const csvRows = rows.map(
    (r) => `${r.tanggal},${r.id},"${r.uraian.replace(/"/g, '""')}",${r.jumlahOutput}`
  );
  const csv = [header, ...csvRows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "uraian-jadwal.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function UraianJadwalPage() {
  const [startDate, setStartDate] = useState<Date>(() => getMondayOfWeek(new Date()));
  const [endDate, setEndDate] = useState<Date>(() => getFridayOfWeek(new Date()));
  const [pattern, setPattern] = useState<PatternKey>("1");
  const [projectRefs, setProjectRefs] = useState<string[]>([]);
  const [rows, setRows] = useState<UraianRow[] | null>(null);
  const [resultContext, setResultContext] = useState<ResultContext | null>(null);
  const [resultParams, setResultParams] = useState<ResultParams | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore the last successful result after reload/navigation. Deferring the
  // state update avoids changing the server-rendered first frame.
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem(URAIAN_JADWAL_CACHE_KEY);
        if (!raw) return;

        const cached = JSON.parse(raw) as UraianJadwalCache;
        if (
          !cached.startDate ||
          !cached.endDate ||
          !(["1", "2"] as string[]).includes(cached.pattern) ||
          !Array.isArray(cached.projectRefs) ||
          !Array.isArray(cached.rows) ||
          cached.rows.length === 0 ||
          !cached.resultContext
        ) {
          return;
        }

        const params: ResultParams = {
          startDate: cached.startDate,
          endDate: cached.endDate,
          pattern: cached.pattern,
          projectRefs: cached.projectRefs,
        };
        setStartDate(new Date(`${cached.startDate}T00:00:00`));
        setEndDate(new Date(`${cached.endDate}T00:00:00`));
        setPattern(cached.pattern);
        setProjectRefs(cached.projectRefs);
        setRows(cached.rows);
        setResultContext(cached.resultContext);
        setResultParams(params);
      } catch {
        // Ignore corrupt/unavailable browser storage.
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  // Keep successful results and any manual textarea edits cached. Input
  // changes alone do not alter/remove the cached result.
  useEffect(() => {
    if (!rows || !resultContext || !resultParams) return;
    try {
      const cache: UraianJadwalCache = {
        ...resultParams,
        rows,
        resultContext,
      };
      localStorage.setItem(URAIAN_JADWAL_CACHE_KEY, JSON.stringify(cache));
    } catch {
      // Storage full/unavailable is non-fatal.
    }
  }, [rows, resultContext, resultParams]);

  const handleDateRangeChange = (start: Date, end: Date) => {
    setStartDate(start);
    setEndDate(end);
  };

  const updateUraian = useCallback((idx: number, value: string) => {
    setRows((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], uraian: value };
      return next;
    });
  }, []);

  const handleGenerate = useCallback(async () => {
    // The previous result persists through reload and input changes, and is
    // intentionally removed only when the user requests a new generation.
    try {
      localStorage.removeItem(URAIAN_JADWAL_CACHE_KEY);
    } catch {
      // Storage unavailable — state is still cleared below.
    }
    setRows(null);
    setResultContext(null);
    setResultParams(null);
    setLoading(true);
    setError(null);
    try {
      const { scheduled } = generateSchedule(PATTERNS[pattern], startDate, endDate);
      const startDateString = toLocalISODate(startDate);
      const endDateString = toLocalISODate(endDate);
      const logbookEntries = matchingCachedLogbook(startDateString, endDateString, projectRefs);
      const res = await fetch("/api/uraian-jadwal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduled,
          startDate: startDateString,
          endDate: endDateString,
          projectRefs,
          logbookEntries,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal generate uraian jadwal");
      const sorted = [...(data.rows as UraianRow[])].sort((a, b) => a.id - b.id || a.tanggal.localeCompare(b.tanggal));
      setRows(sorted);
      setResultContext({
        entryCount: data.contextEntryCount,
        source: data.contextSource,
      });
      setResultParams({
        startDate: startDateString,
        endDate: endDateString,
        pattern,
        projectRefs: [...projectRefs],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan tidak diketahui");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, pattern, projectRefs]);

  const manualCount = rows?.filter((r) => r.uraian.trim() === "").length ?? 0;

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-[1800px] mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Generate Uraian Jadwal</h1>
          <p className="text-sm text-gray-500 mt-1">
            Jadwal task 1 minggu kerja dilengkapi Uraian Aktivitas berbasis commit GitLab
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Minggu Kerja
              </label>
              <WeekPicker startDate={startDate} endDate={endDate} onChange={handleDateRangeChange} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Pattern
              </label>
              <div className="flex rounded-lg border border-gray-300 overflow-hidden h-[38px]">
                {(["1", "2"] as PatternKey[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPattern(p)}
                    className={[
                      "flex-1 text-sm font-medium transition-colors focus:outline-none",
                      pattern === p
                        ? "bg-blue-600 text-white"
                        : "bg-white text-gray-600 hover:bg-gray-50",
                    ].join(" ")}
                  >
                    Pattern {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Repo
              </label>
              <ProjectPicker selected={projectRefs} onChange={setProjectRefs} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleGenerate}
              disabled={loading || projectRefs.length === 0}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold rounded-lg px-6 py-2 text-sm transition-colors"
            >
              {loading ? "Menyusun jadwal & uraian…" : rows ? "Generate Ulang" : "Generate"}
            </button>
            {projectRefs.length === 0 && (
              <p className="text-xs text-gray-400">Pilih minimal satu repo dulu.</p>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {rows && (
          <div className="bg-white rounded-2xl shadow overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-700">Uraian Jadwal ({rows.length} baris)</h2>
                {resultContext && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Disintesis dari {resultContext.entryCount} entri konteks logbook
                    {resultContext.source === "logbook-cache"
                      ? " hasil Generate Logbook yang tersimpan."
                      : " yang dibuat dari perubahan GitLab."}
                  </p>
                )}
                {manualCount > 0 && (
                  <p className="text-xs text-amber-600 mt-0.5">
                    {manualCount} baris perlu diisi manual (tidak ada commit yang cocok)
                  </p>
                )}
              </div>
              <button
                onClick={() => downloadCSV(rows)}
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
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tanggal</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Kode Kegiatan</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Keterangan</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Uraian Aktivitas</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Jumlah Output</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((r, idx) => {
                    const isEmpty = r.uraian.trim() === "";
                    return (
                      <tr key={idx} className={["hover:bg-gray-50 transition-colors align-top", isEmpty ? "bg-amber-50/60" : ""].join(" ")}>
                        <td className="px-6 py-3 text-gray-400">{idx + 1}</td>
                        <td className="px-6 py-3 text-gray-600">
                          <span className="font-mono">{r.tanggal}</span>
                          <span className="block text-xs text-gray-400">{getDayLabel(r.tanggal)}</span>
                        </td>
                        <td className="px-6 py-3 font-medium text-gray-800">{r.id}</td>
                        <td className="px-6 py-3 text-gray-500 text-xs max-w-xs">{KETERANGAN_MAP[r.id] ?? ""}</td>
                        <td className="px-3 py-2 min-w-[420px]">
                          <AutoGrowTextarea
                            value={r.uraian}
                            onChange={(value) => updateUraian(idx, value)}
                            placeholder="Isi uraian aktivitas…"
                            className={[
                              "w-full resize-none overflow-hidden rounded-lg px-3 py-1.5 text-sm text-gray-700 leading-relaxed outline-none transition-colors",
                              "bg-transparent border border-transparent hover:border-gray-200 focus:border-blue-400 focus:bg-white focus:ring-1 focus:ring-blue-400",
                              isEmpty ? "placeholder:text-amber-500" : "",
                            ].join(" ")}
                          />
                        </td>
                        <td className="px-6 py-3 text-right text-gray-700">{r.jumlahOutput}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
