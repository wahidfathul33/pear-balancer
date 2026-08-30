"use client";

import { toLocalISODate } from "@/app/components/WeekPicker";

const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

export function getScheduleWorkDates(startDate: Date, endDate: Date): Date[] {
  const dates: Date[] = [];
  const current = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

  while (current <= end) {
    const day = current.getDay();
    if (day >= 1 && day <= 5) dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

export function ScheduleDayToggles({
  startDate,
  endDate,
  excludedDates,
  onChange,
}: {
  startDate: Date;
  endDate: Date;
  excludedDates: string[];
  onChange: (dates: string[]) => void;
}) {
  const workDates = getScheduleWorkDates(startDate, endDate);
  const excluded = new Set(excludedDates);

  function toggleDate(date: string) {
    const next = new Set(excludedDates);
    if (next.has(date)) next.delete(date);
    else next.add(date);
    onChange([...next].sort());
  }

  return (
    <fieldset className="mt-4 border-t border-slate-200 pt-4">
      <legend className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
        Hari Jadwal Aktif
      </legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {workDates.map((date) => {
          const dateString = toLocalISODate(date);
          const active = !excluded.has(dateString);
          return (
            <button
              key={dateString}
              type="button"
              role="switch"
              aria-checked={active}
              aria-label={`${active ? "Nonaktifkan" : "Aktifkan"} ${DAY_NAMES[date.getDay()]} ${dateString}`}
              onClick={() => toggleDate(dateString)}
              className={[
                "flex min-w-36 items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500",
                active
                  ? "border-green-300 bg-green-50 text-green-800"
                  : "border-slate-300 bg-slate-100 text-slate-500",
              ].join(" ")}
            >
              <span
                aria-hidden="true"
                className={[
                  "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                  active ? "bg-green-600" : "bg-slate-300",
                ].join(" ")}
              >
                <span
                  className={[
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                    active ? "translate-x-[18px]" : "translate-x-0.5",
                  ].join(" ")}
                />
              </span>
              <span>
                <span className="block text-xs font-semibold">{DAY_NAMES[date.getDay()]}</span>
                <span className="block font-mono text-[11px]">{dateString}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Matikan tanggal libur atau cuti agar tidak mendapat task.
      </p>
    </fieldset>
  );
}
