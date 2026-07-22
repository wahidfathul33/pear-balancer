"use client";

import { useState, useRef, useEffect } from "react";

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const DAY_HEADERS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

export function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getMondayOfWeek(d: Date): Date {
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  return mon;
}

export function getFridayOfWeek(d: Date): Date {
  const mon = getMondayOfWeek(d);
  const fri = new Date(mon);
  fri.setDate(mon.getDate() + 4);
  return fri;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isBetween(d: Date, start: Date, end: Date) {
  const t = d.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

/** Build grid: always Mon-Sun, pad to full weeks */
function buildCalendarDays(year: number, month: number): (Date | null)[] {
  const firstOfMonth = new Date(year, month, 1);
  const firstDay = firstOfMonth.getDay(); // 0=Sun
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function WeekPicker({
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
    if (!open) {
      setTempStart(null);
      setHoverDate(null);
    }
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
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else setViewMonth((m) => m + 1);
  }

  function isWorkday(d: Date) {
    return d.getDay() >= 1 && d.getDay() <= 5;
  }

  function handleDayClick(d: Date) {
    if (!isWorkday(d)) return;
    if (!tempStart) {
      setTempStart(d);
    } else {
      const sameWeek =
        getMondayOfWeek(tempStart).getTime() === getMondayOfWeek(d).getTime();
      if (sameWeek) {
        let s = tempStart,
          e = d;
        if (e < s) {
          const t = s;
          s = e;
          e = t;
        }
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
  let hlStart: Date = startDate,
    hlEnd: Date = endDate;
  if (tempStart) {
    const sameWeekHover =
      hoverDate &&
      isWorkday(hoverDate) &&
      getMondayOfWeek(tempStart).getTime() === getMondayOfWeek(hoverDate).getTime();
    if (sameWeekHover && hoverDate) {
      hlStart = tempStart < hoverDate ? tempStart : hoverDate;
      hlEnd = tempStart < hoverDate ? hoverDate : tempStart;
    } else {
      hlStart = tempStart;
      hlEnd = tempStart;
    }
  }

  const phase = tempStart ? "end" : "start";
  const displayStr = `${toLocalISODate(startDate)}  →  ${toLocalISODate(endDate)}`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
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
                onClick={() => {
                  setTempStart(null);
                  setHoverDate(null);
                }}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              >
                Batal
              </button>
            )}
          </div>

          <div className="flex items-center justify-between mb-2">
            <button onClick={prevMonth} className="p-1 rounded hover:bg-gray-100 text-gray-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <span className="text-sm font-semibold text-gray-700">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button onClick={nextMonth} className="p-1 rounded hover:bg-gray-100 text-gray-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg>
            </button>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {DAY_HEADERS.map((h) => (
              <div key={h} className="text-center text-xs font-semibold text-gray-400 py-1">{h}</div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const wknd = !isWorkday(d);
              const inRange = !wknd && isBetween(d, hlStart, hlEnd);
              const isHlStart = !wknd && isSameDay(d, hlStart);
              const isHlEnd = !wknd && isSameDay(d, hlEnd);
              const isInner = inRange && !isHlStart && !isHlEnd;
              return (
                <div
                  key={i}
                  className={[
                    "flex items-center justify-center h-8 text-xs select-none transition-colors",
                    wknd ? "text-gray-300" : "cursor-pointer",
                    isHlStart || isHlEnd ? "bg-blue-600 text-white rounded-full z-10" : "",
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
