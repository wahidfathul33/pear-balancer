"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  DEFAULT_PATTERN_1,
  DEFAULT_PATTERN_2,
  PatternRow,
  clonePattern,
  expandPattern,
  KETERANGAN_MAP,
} from "@/lib/data";
import { generateSchedule, DEFAULT_MAX_BOBOT } from "@/lib/scheduler";
import type { DaySummary } from "@/lib/scheduler";
import { WeekPicker, getMondayOfWeek, getFridayOfWeek, toLocalISODate } from "@/app/components/WeekPicker";
import { ProjectPicker } from "@/app/components/ProjectPicker";
import { PatternEditor } from "@/app/components/PatternEditor";
import { ScheduleDayToggles, getScheduleWorkDates } from "@/app/components/ScheduleDayToggles";
import type { LogbookEntry } from "@/lib/logbook";
import { downloadXlsx } from "@/lib/excel";

type PatternKey = "1" | "2";

const DEFAULT_PATTERNS: Record<PatternKey, PatternRow[]> = {
  "1": DEFAULT_PATTERN_1,
  "2": DEFAULT_PATTERN_2,
};

const LOGBOOK_CACHE_KEY = "logbook-cache-v1";
const URAIAN_JADWAL_CACHE_KEY = "uraian-jadwal-cache-v2";

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
  scheduleStartDate: string;
  scheduleEndDate: string;
  commitStartDate: string;
  commitEndDate: string;
  pattern: PatternKey;
  projectRefs: string[];
  excludedScheduleDates: string[];
}

interface UraianJadwalCache extends ResultParams {
  rows: UraianRow[];
  resultContext: ResultContext;
  daySummaries?: DaySummary[];
  totalBobot?: number;
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

function downloadUraianExcel(rows: UraianRow[]) {
  return downloadXlsx({
    filename: "uraian-jadwal.xlsx",
    sheetName: "Uraian Jadwal",
    rows,
    columns: [
      { header: "Tanggal", value: (row) => row.tanggal, width: 15 },
      { header: "Kode Kegiatan", value: (row) => row.id, width: 17 },
      { header: "Uraian Aktivitas", value: (row) => row.uraian, width: 100 },
      { header: "Jumlah Output", value: (row) => row.jumlahOutput, width: 16 },
      { header: "Link Bukti (Opsional)", value: () => "", width: 28 },
    ],
  });
}

export default function UraianJadwalPage() {
  const [scheduleStartDate, setScheduleStartDate] = useState<Date>(() => getMondayOfWeek(new Date()));
  const [scheduleEndDate, setScheduleEndDate] = useState<Date>(() => getFridayOfWeek(new Date()));
  const [commitStartDate, setCommitStartDate] = useState<Date>(() => getMondayOfWeek(new Date()));
  const [commitEndDate, setCommitEndDate] = useState<Date>(() => getFridayOfWeek(new Date()));
  const [pattern, setPattern] = useState<PatternKey>("1");
  const [patternRows, setPatternRows] = useState<PatternRow[]>(() => clonePattern(DEFAULT_PATTERNS["1"]));
  const [maxBobot, setMaxBobot] = useState<number>(DEFAULT_MAX_BOBOT);
  const [projectRefs, setProjectRefs] = useState<string[]>([]);
  const [excludedScheduleDates, setExcludedScheduleDates] = useState<string[]>([]);
  const [rows, setRows] = useState<UraianRow[] | null>(null);
  const [daySummaries, setDaySummaries] = useState<DaySummary[] | null>(null);
  const [totalBobot, setTotalBobot] = useState(0);
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
          !cached.scheduleStartDate ||
          !cached.scheduleEndDate ||
          !cached.commitStartDate ||
          !cached.commitEndDate ||
          !(["1", "2"] as string[]).includes(cached.pattern) ||
          !Array.isArray(cached.projectRefs) ||
          !Array.isArray(cached.rows) ||
          cached.rows.length === 0 ||
          !cached.resultContext
        ) {
          return;
        }

        const params: ResultParams = {
          scheduleStartDate: cached.scheduleStartDate,
          scheduleEndDate: cached.scheduleEndDate,
          commitStartDate: cached.commitStartDate,
          commitEndDate: cached.commitEndDate,
          pattern: cached.pattern,
          projectRefs: cached.projectRefs,
          excludedScheduleDates: cached.excludedScheduleDates ?? [],
        };
        const restoredScheduleStart = new Date(`${cached.scheduleStartDate}T00:00:00`);
        const restoredScheduleEnd = new Date(`${cached.scheduleEndDate}T00:00:00`);
        const restoredSchedule = generateSchedule(
          expandPattern(DEFAULT_PATTERNS[cached.pattern]),
          restoredScheduleStart,
          restoredScheduleEnd,
          DEFAULT_MAX_BOBOT,
          cached.excludedScheduleDates ?? []
        );
        setScheduleStartDate(restoredScheduleStart);
        setScheduleEndDate(restoredScheduleEnd);
        setCommitStartDate(new Date(`${cached.commitStartDate}T00:00:00`));
        setCommitEndDate(new Date(`${cached.commitEndDate}T00:00:00`));
        setPattern(cached.pattern);
        setPatternRows(clonePattern(DEFAULT_PATTERNS[cached.pattern]));
        setProjectRefs(cached.projectRefs);
        setExcludedScheduleDates(cached.excludedScheduleDates ?? []);
        setRows(cached.rows);
        setDaySummaries(
          Array.isArray(cached.daySummaries)
            ? cached.daySummaries
            : restoredSchedule.daySummaries
        );
        setTotalBobot(
          typeof cached.totalBobot === "number"
            ? cached.totalBobot
            : restoredSchedule.totalBobot
        );
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
    if (!rows || !daySummaries || !resultContext || !resultParams) return;
    try {
      const cache: UraianJadwalCache = {
        ...resultParams,
        rows,
        daySummaries,
        totalBobot,
        resultContext,
      };
      localStorage.setItem(URAIAN_JADWAL_CACHE_KEY, JSON.stringify(cache));
    } catch {
      // Storage full/unavailable is non-fatal.
    }
  }, [rows, daySummaries, totalBobot, resultContext, resultParams]);

  const handleScheduleRangeChange = (start: Date, end: Date) => {
    setScheduleStartDate(start);
    setScheduleEndDate(end);
    setExcludedScheduleDates([]);
  };

  const handleCommitRangeChange = (start: Date, end: Date) => {
    setCommitStartDate(start);
    setCommitEndDate(end);
  };

  const selectPattern = (key: PatternKey) => {
    setPattern(key);
    setPatternRows(clonePattern(DEFAULT_PATTERNS[key]));
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
    setDaySummaries(null);
    setTotalBobot(0);
    setResultContext(null);
    setResultParams(null);
    setLoading(true);
    setError(null);
    try {
      const scheduleResult = generateSchedule(
        expandPattern(patternRows),
        scheduleStartDate,
        scheduleEndDate,
        maxBobot,
        excludedScheduleDates
      );
      const { scheduled } = scheduleResult;
      const scheduleStartDateString = toLocalISODate(scheduleStartDate);
      const scheduleEndDateString = toLocalISODate(scheduleEndDate);
      const commitStartDateString = toLocalISODate(commitStartDate);
      const commitEndDateString = toLocalISODate(commitEndDate);
      const logbookEntries = matchingCachedLogbook(
        commitStartDateString,
        commitEndDateString,
        projectRefs
      );
      const res = await fetch("/api/uraian-jadwal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduled,
          commitStartDate: commitStartDateString,
          commitEndDate: commitEndDateString,
          projectRefs,
          logbookEntries,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal generate uraian jadwal");
      const sorted = [...(data.rows as UraianRow[])].sort((a, b) => a.id - b.id || a.tanggal.localeCompare(b.tanggal));
      setRows(sorted);
      setDaySummaries(scheduleResult.daySummaries);
      setTotalBobot(scheduleResult.totalBobot);
      setResultContext({
        entryCount: data.contextEntryCount,
        source: data.contextSource,
      });
      setResultParams({
        scheduleStartDate: scheduleStartDateString,
        scheduleEndDate: scheduleEndDateString,
        commitStartDate: commitStartDateString,
        commitEndDate: commitEndDateString,
        pattern,
        projectRefs: [...projectRefs],
        excludedScheduleDates: [...excludedScheduleDates],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan tidak diketahui");
    } finally {
      setLoading(false);
    }
  }, [scheduleStartDate, scheduleEndDate, commitStartDate, commitEndDate, pattern, patternRows, maxBobot, projectRefs, excludedScheduleDates]);

  const manualCount = rows?.filter((r) => r.uraian.trim() === "").length ?? 0;
  const activeScheduleDayCount = getScheduleWorkDates(scheduleStartDate, scheduleEndDate)
    .filter((date) => !excludedScheduleDates.includes(toLocalISODate(date))).length;

  return (
    <main className="min-h-screen bg-slate-200 py-10">
      <div className="w-[80%] mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Generate Uraian Jadwal</h1>
          <p className="text-sm text-gray-500 mt-1">
            Jadwal task 1 minggu kerja dilengkapi Uraian Aktivitas berbasis commit GitLab
          </p>
        </div>

        <div className="bg-slate-50 border border-slate-300 rounded-2xl shadow-lg shadow-slate-900/10 p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Rentang Jadwal Task
              </label>
              <WeekPicker
                startDate={scheduleStartDate}
                endDate={scheduleEndDate}
                onChange={handleScheduleRangeChange}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Rentang Commit GitLab
              </label>
              <WeekPicker
                startDate={commitStartDate}
                endDate={commitEndDate}
                onChange={handleCommitRangeChange}
                selectionMode="range"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Pattern
              </label>
              <div className="w-full h-10 flex rounded-lg border border-gray-300 overflow-hidden">
                {(["1", "2"] as PatternKey[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => selectPattern(p)}
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
          <ScheduleDayToggles
            startDate={scheduleStartDate}
            endDate={scheduleEndDate}
            excludedDates={excludedScheduleDates}
            onChange={setExcludedScheduleDates}
          />
          <div className="mt-4">
            <PatternEditor
              rows={patternRows}
              onChange={setPatternRows}
              onReset={() => setPatternRows(clonePattern(DEFAULT_PATTERNS[pattern]))}
              maxBobot={maxBobot}
              onMaxBobotChange={setMaxBobot}
            />
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleGenerate}
              disabled={loading || projectRefs.length === 0 || activeScheduleDayCount === 0}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold rounded-lg px-6 py-2 text-sm transition-colors"
            >
              {loading ? "Menyusun jadwal & uraian…" : rows ? "Generate Ulang" : "Generate"}
            </button>
            {projectRefs.length === 0 && (
              <p className="text-xs text-gray-400">Pilih minimal satu repo dulu.</p>
            )}
            {activeScheduleDayCount === 0 && (
              <p className="text-xs text-red-600">Aktifkan minimal satu hari jadwal.</p>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {daySummaries && (
          <div className="bg-slate-50 border border-slate-300 rounded-2xl shadow-lg shadow-slate-900/10 p-4 flex flex-wrap gap-4 items-center justify-between">
            <div className="flex flex-wrap gap-6">
              {daySummaries.map((summary) => (
                <div key={summary.tanggal} className="text-center">
                  <p className="text-xs text-gray-500 font-medium">
                    {getDayLabel(summary.tanggal)}
                  </p>
                  <p className="text-xs text-gray-400">{summary.tanggal}</p>
                  <p className="text-lg font-bold text-blue-600">{summary.totalBobot}</p>
                </div>
              ))}
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 font-medium">Total Bobot</p>
              <p className="text-2xl font-bold text-gray-800">{totalBobot}</p>
              <p className="text-xs text-gray-400">maks 27.5</p>
            </div>
          </div>
        )}

        {rows && (
          <div className="bg-slate-50 border border-slate-300 rounded-2xl shadow-lg shadow-slate-900/10 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h2 className="text-base font-semibold text-gray-700">Uraian Jadwal ({rows.length} baris)</h2>
                {resultContext && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Disintesis dari {resultContext.entryCount} entri konteks logbook
                    {resultContext.source === "logbook-cache"
                      ? " hasil Generate Logbook yang tersimpan."
                      : " yang dibuat dari perubahan GitLab."}
                    {resultParams &&
                      ` Rentang commit ${resultParams.commitStartDate} sampai ${resultParams.commitEndDate}.`}
                  </p>
                )}
                {manualCount > 0 && (
                  <p className="text-xs text-amber-600 mt-0.5">
                    {manualCount} baris perlu diisi manual (tidak ada commit yang cocok)
                  </p>
                )}
              </div>
              <button
                onClick={() => void downloadUraianExcel(rows)}
                className="bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg px-4 py-2 transition-colors"
              >
                Download Excel
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-200/70 border-b border-slate-300">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">#</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tanggal</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Keterangan</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Uraian Aktivitas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {rows.map((r, idx) => {
                    const isEmpty = r.uraian.trim() === "";
                    return (
                      <tr key={idx} className={["hover:bg-slate-100 transition-colors align-top", isEmpty ? "bg-amber-50/60" : ""].join(" ")}>
                        <td className="px-6 py-3 text-gray-400">{idx + 1}</td>
                        <td className="px-6 py-3 text-gray-600">
                          <span className="font-mono">{r.tanggal}</span>
                          <span className="block text-xs text-gray-400">{getDayLabel(r.tanggal)}</span>
                        </td>
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
