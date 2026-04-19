"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { PATTERN_1, PATTERN_2, Task } from "@/lib/data";
import { generateSchedule, ScheduledTask, DaySummary } from "@/lib/scheduler";

type PatternKey = "1" | "2";

const PATTERNS: Record<PatternKey, Task[]> = {
  "1": PATTERN_1,
  "2": PATTERN_2,
};

const MONTH_NAMES = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember",
];
const DAY_HEADERS = ["Sen","Sel","Rab","Kam","Jum","Sab","Min"];

function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getMondayOfWeek(d: Date): Date {
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  return mon;
}

function getFridayOfWeek(d: Date): Date {
  const mon = getMondayOfWeek(d);
  const fri = new Date(mon);
  fri.setDate(mon.getDate() + 4);
  return fri;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function isBetween(d: Date, start: Date, end: Date) {
  const t = d.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

/** Build grid: always Mon-Sun, pad to full weeks */
function buildCalendarDays(year: number, month: number): (Date | null)[] {
  const firstOfMonth = new Date(year, month, 1);
  const firstDay = firstOfMonth.getDay(); // 0=Sun
  // offset so Mon=0: if Sun(0) → 6, else day-1
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function WeekPicker({
  startDate,
  endDate,
  onChange,
}: {
  startDate: Date;
  endDate: Date;
  onChange: (start: Date, end: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(startDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(startDate.getMonth());
  const [tempStart, setTempStart] = useState<Date | null>(null);
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) { setTempStart(null); setHoverDate(null); }
  }, [open]);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const cells = buildCalendarDays(viewYear, viewMonth);

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  function isWorkday(d: Date) { return d.getDay() >= 1 && d.getDay() <= 5; }

  function handleDayClick(d: Date) {
    if (!isWorkday(d)) return;
    if (!tempStart) {
      setTempStart(d);
    } else {
      const sameWeek =
        getMondayOfWeek(tempStart).getTime() === getMondayOfWeek(d).getTime();
      if (sameWeek) {
        let s = tempStart, e = d;
        if (e < s) { const t = s; s = e; e = t; }
        onChange(s, e);
        setTempStart(null);
        setHoverDate(null);
        setOpen(false);
      } else {
        setTempStart(d);
        setHoverDate(null);
      }
    }
  }

  // Compute highlight range
  let hlStart: Date = startDate, hlEnd: Date = endDate;
  if (tempStart) {
    const sameWeekHover =
      hoverDate &&
      isWorkday(hoverDate) &&
      getMondayOfWeek(tempStart).getTime() === getMondayOfWeek(hoverDate).getTime();
    if (sameWeekHover && hoverDate) {
      hlStart = tempStart < hoverDate ? tempStart : hoverDate;
      hlEnd   = tempStart < hoverDate ? hoverDate : tempStart;
    } else {
      hlStart = tempStart;
      hlEnd   = tempStart;
    }
  }

  const phase = tempStart ? "end" : "start";
  const displayStr = `${toLocalISODate(startDate)}  →  ${toLocalISODate(endDate)}`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-left"
      >
        <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span className="font-mono text-gray-700 text-xs">{displayStr}</span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 bg-white rounded-2xl shadow-xl border border-gray-100 p-4 w-72">
          {/* Phase indicator */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1 text-xs">
              <span className={`px-2 py-0.5 rounded-full font-semibold transition-colors ${phase === "start" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-400"}`}>
                1 Awal
              </span>
              <span className="text-gray-300 mx-0.5">→</span>
              <span className={`px-2 py-0.5 rounded-full font-semibold transition-colors ${phase === "end" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-400"}`}>
                2 Akhir
              </span>
            </div>
            {tempStart && (
              <button
                onClick={() => { setTempStart(null); setHoverDate(null); }}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              >
                Batal
              </button>
            )}
          </div>

          {/* Month nav */}
          <div className="flex items-center justify-between mb-2">
            <button onClick={prevMonth} className="p-1 rounded hover:bg-gray-100 text-gray-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <span className="text-sm font-semibold text-gray-700">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button onClick={nextMonth} className="p-1 rounded hover:bg-gray-100 text-gray-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAY_HEADERS.map(h => (
              <div key={h} className="text-center text-xs font-semibold text-gray-400 py-1">{h}</div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7">
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const wknd = !isWorkday(d);
              const inRange = !wknd && isBetween(d, hlStart, hlEnd);
              const isHlStart = !wknd && isSameDay(d, hlStart);
              const isHlEnd   = !wknd && isSameDay(d, hlEnd);
              const isInner   = inRange && !isHlStart && !isHlEnd;
              return (
                <div
                  key={i}
                  className={[
                    "flex items-center justify-center h-8 text-xs select-none transition-colors",
                    wknd ? "text-gray-300" : "cursor-pointer",
                    (isHlStart || isHlEnd) ? "bg-blue-600 text-white rounded-full z-10" : "",
                    isInner ? "bg-blue-100 text-blue-700" : "",
                    !wknd && !inRange && !isHlStart && !isHlEnd ? "text-gray-700 hover:bg-gray-100 rounded-full" : "",
                  ].join(" ")}
                  onMouseEnter={() => !wknd && setHoverDate(d)}
                  onMouseLeave={() => setHoverDate(null)}
                  onClick={() => handleDayClick(d)}
                >
                  {d.getDate()}
                </div>
              );
            })}
          </div>

          <p className="text-xs text-gray-400 mt-3 text-center">
            {phase === "start"
              ? "Klik untuk pilih tanggal awal"
              : `Awal: ${toLocalISODate(tempStart!)} · Klik tanggal akhir`}
          </p>
        </div>
      )}
    </div>
  );
}

function CopyTanggalButton({ tasks }: { tasks: ScheduledTask[] }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    const text = tasks.map((t) => t.tanggal).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button
      onClick={handleCopy}
      className={[
        "flex items-center gap-1.5 text-xs font-semibold rounded-lg px-4 py-2 transition-colors",
        copied
          ? "bg-green-100 text-green-700"
          : "bg-gray-100 hover:bg-gray-200 text-gray-600",
      ].join(" ")}
    >
      {copied ? (
        <>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Tersalin!
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          Copy Tanggal
        </>
      )}
    </button>
  );
}

function downloadCSV(tasks: ScheduledTask[]) {
  const header = "id,bobot,prioritas,keterangan,tanggal";
  const rows = tasks.map(
    (t) => `${t.id},${t.bobot},${t.prioritas ?? ""},"${t.keterangan}",${t.tanggal}`
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "jadwal.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function getDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  return days[d.getDay()];
}

export default function Home() {
  const [startDate, setStartDate] = useState<Date>(() => getMondayOfWeek(new Date()));
  const [endDate, setEndDate] = useState<Date>(() => getFridayOfWeek(new Date()));
  const [pattern, setPattern] = useState<PatternKey>("1");
  const [scheduled, setScheduled] = useState<ScheduledTask[] | null>(null);
  const [daySummaries, setDaySummaries] = useState<DaySummary[] | null>(null);
  const [totalBobot, setTotalBobot] = useState<number>(0);

  const handleDateRangeChange = (start: Date, end: Date) => {
    setStartDate(start);
    setEndDate(end);
  };

  const handleGenerate = useCallback(() => {
    const tasks = PATTERNS[pattern];
    const result = generateSchedule(tasks, startDate, endDate);
    setScheduled(result.scheduled);
    setDaySummaries(result.daySummaries);
    setTotalBobot(result.totalBobot);
  }, [startDate, endDate, pattern]);

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Generate Jadwal Task</h1>
          <p className="text-sm text-gray-500 mt-1">
            Distribusi task selama 1 minggu kerja (Senin–Jumat), maks bobot 27.5
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1 sm:col-span-2">
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
          </div>
          <div className="mt-4">
            <button
              onClick={handleGenerate}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-6 py-2 text-sm transition-colors"
            >
              Generate
            </button>
          </div>
        </div>

        {scheduled && daySummaries && (
          <>
            <div className="bg-white rounded-2xl shadow p-4 flex flex-wrap gap-4 items-center justify-between">
              <div className="flex flex-wrap gap-6">
                {daySummaries.map((ds) => (
                  <div key={ds.tanggal} className="text-center">
                    <p className="text-xs text-gray-500 font-medium">{getDayLabel(ds.tanggal)}</p>
                    <p className="text-xs text-gray-400">{ds.tanggal}</p>
                    <p className="text-lg font-bold text-blue-600">{ds.totalBobot}</p>
                  </div>
                ))}
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 font-medium">Total Bobot</p>
                <p className="text-2xl font-bold text-gray-800">{totalBobot}</p>
                <p className="text-xs text-gray-400">maks 27.5</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h2 className="text-base font-semibold text-gray-700">
                  Jadwal Task ({scheduled.length} task)
                </h2>
                <div className="flex gap-2">
                  <CopyTanggalButton tasks={[...scheduled].sort((a, b) => a.id - b.id || a.tanggal.localeCompare(b.tanggal))} />
                  <button
                    onClick={() => downloadCSV(scheduled)}
                    className="bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg px-4 py-2 transition-colors"
                  >
                    Download CSV
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">#</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">ID</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Keterangan</th>
                      <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Bobot</th>
                      <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Prioritas</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Hari</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tanggal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {[...scheduled]
                      .sort((a, b) => a.id - b.id || a.tanggal.localeCompare(b.tanggal))
                      .map((task, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-3 text-gray-400">{idx + 1}</td>
                        <td className="px-6 py-3 font-medium text-gray-800">{task.id}</td>
                        <td className="px-6 py-3 text-gray-600 max-w-xs">{task.keterangan}</td>
                        <td className="px-6 py-3 text-right text-gray-700">{task.bobot}</td>
                        <td className="px-6 py-3 text-right">
                          {task.prioritas === null ? (
                            <span className="text-gray-400 italic">null</span>
                          ) : task.prioritas === 0 ? (
                            <span className="inline-block px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-medium">filler</span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">{task.prioritas}</span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-gray-600">{getDayLabel(task.tanggal)}</td>
                        <td className="px-6 py-3 font-mono text-gray-700">{task.tanggal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-gray-100 px-6 py-4 bg-gray-50">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Total Bobot per Hari
                </p>
                <div className="flex flex-wrap gap-6">
                  {daySummaries.map((ds) => (
                    <div key={ds.tanggal} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">{getDayLabel(ds.tanggal)} ({ds.tanggal}):</span>
                      <span className="text-sm font-bold text-gray-800">{ds.totalBobot}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-xs text-gray-500">Total:</span>
                    <span className="text-sm font-bold text-blue-700">{totalBobot}</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
