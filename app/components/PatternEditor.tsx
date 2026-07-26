"use client";

import { useState } from "react";
import { PatternRow, KETERANGAN_MAP } from "@/lib/data";

/**
 * Collapsible per-category stepper for a pattern. Each row's count can be
 * raised or lowered (0 keeps the row visible so it can be brought back).
 * Bobot and prioritas are fixed per category and shown for reference. The
 * bobot cap is editable and may be set above the default — raising it lets a
 * pattern exceed 27.5 without the scheduler trimming it. State is owned by the
 * parent; this component is controlled via `rows`/`maxBobot` and callbacks.
 */
export function PatternEditor({
  rows,
  onChange,
  onReset,
  maxBobot,
  onMaxBobotChange,
  defaultOpen = false,
}: {
  rows: PatternRow[];
  onChange: (rows: PatternRow[]) => void;
  onReset: () => void;
  maxBobot: number;
  onMaxBobotChange: (maxBobot: number) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const totalRows = rows.reduce((sum, row) => sum + row.count, 0);
  const totalBobot = Math.round(rows.reduce((sum, row) => sum + row.bobot * row.count, 0) * 100) / 100;
  const overCap = totalBobot > maxBobot;

  const setCount = (id: number, count: number) => {
    onChange(rows.map((row) => (row.id === id ? { ...row, count: Math.max(0, count) } : row)));
  };

  return (
    <div className="rounded-lg border border-gray-300 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <svg
            className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          Atur Jumlah Task
        </span>
        <span className="flex items-center gap-3 text-xs">
          <span className="text-gray-500">{totalRows} baris</span>
          <span className={overCap ? "font-bold text-red-600" : "font-semibold text-gray-700"}>
            Bobot {totalBobot} / {maxBobot}
          </span>
        </span>
      </button>

      {open && (
        <div className="border-t border-gray-100">
          <div className="divide-y divide-gray-100">
            {rows.map((row) => (
              <div key={row.id} className="flex items-center gap-3 px-3 py-2">
                <span className="w-12 font-mono text-xs font-semibold text-gray-700">{row.id}</span>
                <span className="flex-1 truncate text-xs text-gray-500" title={KETERANGAN_MAP[row.id]}>
                  {KETERANGAN_MAP[row.id]}
                </span>
                <span className="hidden text-xs text-gray-400 sm:inline">
                  bobot {row.bobot} · prio {row.prioritas ?? "-"}
                </span>
                <div className="flex items-center overflow-hidden rounded-md border border-gray-300">
                  <button
                    type="button"
                    onClick={() => setCount(row.id, row.count - 1)}
                    disabled={row.count <= 0}
                    aria-label={`Kurangi ${row.id}`}
                    className="px-2.5 py-1 text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm font-semibold text-gray-800">{row.count}</span>
                  <button
                    type="button"
                    onClick={() => setCount(row.id, row.count + 1)}
                    aria-label={`Tambah ${row.id}`}
                    className="px-2.5 py-1 text-gray-600 hover:bg-gray-100"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 bg-slate-50 px-3 py-2">
            <div className="flex items-center gap-2">
              <label htmlFor="maks-bobot" className="text-xs text-gray-500">
                Maks bobot
              </label>
              <input
                id="maks-bobot"
                type="number"
                min={0}
                step={0.5}
                value={maxBobot}
                onChange={(e) => onMaxBobotChange(Number(e.target.value))}
                className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-800 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={onReset}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              Reset ke default
            </button>
          </div>

          {overCap && (
            <p className="border-t border-gray-100 bg-red-50 px-3 py-1.5 text-xs text-red-600">
              Total bobot {totalBobot} melebihi maks {maxBobot}; saat generate, task ringan/filler akan
              dipangkas otomatis. Naikkan maks bobot bila ingin melewati batas.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
