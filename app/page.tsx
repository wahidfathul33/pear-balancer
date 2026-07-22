"use client";

import { useState, useCallback } from "react";
import { PATTERN_1, PATTERN_2, Task } from "@/lib/data";
import { generateSchedule, ScheduledTask, DaySummary } from "@/lib/scheduler";
import { WeekPicker, getMondayOfWeek, getFridayOfWeek } from "@/app/components/WeekPicker";

type PatternKey = "1" | "2";

const PATTERNS: Record<PatternKey, Task[]> = {
  "1": PATTERN_1,
  "2": PATTERN_2,
};

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
