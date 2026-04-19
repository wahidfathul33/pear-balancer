import { Task } from "./data";

export interface ScheduledTask {
  id: number;
  bobot: number;
  prioritas: number | null;
  keterangan: string;
  tanggal: string; // YYYY-MM-DD
}

export interface DaySummary {
  tanggal: string;
  totalBobot: number;
  tasks: ScheduledTask[];
}

const MAX_BOBOT = 27.5;
const DAY_NAMES = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat"];

/** Returns YYYY-MM-DD string for a Date (local time) */
function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Get Mon–Fri dates within [startDate, endDate] inclusive */
function getWorkDays(startDate: Date, endDate: Date): Date[] {
  const days: Date[] = [];
  const cur = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  while (cur <= end) {
    const dow = cur.getDay();
    if (dow >= 1 && dow <= 5) days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

/** Normalize prioritas: null → 0 */
function normPriority(p: number | null): number {
  return p === null ? 0 : p;
}

export function generateSchedule(
  tasks: Task[],
  startDate: Date,
  endDate: Date,
): { scheduled: ScheduledTask[]; daySummaries: DaySummary[]; totalBobot: number } {
  // 1. Trim to max bobot 27.5
  let totalBobot = tasks.reduce((s, t) => s + t.bobot, 0);
  let workingTasks = [...tasks];

  if (totalBobot > MAX_BOBOT) {
    // Sort fillers (priority 0) bobot DESC to remove heaviest fillers first
    // Then main tasks bobot ASC to remove lightest mains
    workingTasks.sort((a, b) => {
      const pa = normPriority(a.prioritas);
      const pb = normPriority(b.prioritas);
      if (pa === 0 && pb === 0) return b.bobot - a.bobot;
      if (pa === 0) return -1; // remove fillers first
      if (pb === 0) return 1;
      return a.bobot - b.bobot; // remove lightest mains last resort
    });

    const trimmed: Task[] = [];
    let acc = 0;
    // We must include all tasks but trim until total <= 27.5
    // Strategy: remove from tail of sorted list (fillers first, heaviest first)
    // Rebuild: keep everything that fits
    for (const t of [...tasks]) {
      if (acc + t.bobot <= MAX_BOBOT) {
        trimmed.push(t);
        acc += t.bobot;
      }
    }
    workingTasks = trimmed;
    totalBobot = acc;
  }

  // 2. Split into main (priority > 0) and filler (priority == 0)
  const mainTasks = workingTasks
    .filter((t) => normPriority(t.prioritas) > 0)
    .sort((a, b) => {
      const pa = normPriority(a.prioritas);
      const pb = normPriority(b.prioritas);
      if (pa !== pb) return pa - pb; // priority ASC (1 = paling awal)
      return b.bobot - a.bobot; // bobot DESC
    });

  const fillerTasks = workingTasks
    .filter((t) => normPriority(t.prioritas) === 0)
    .sort((a, b) => a.bobot - b.bobot); // bobot ASC

  const sortedTasks = [...mainTasks, ...fillerTasks];

  // 3. Get work days
  const workDays = getWorkDays(startDate, endDate);
  const numDays = workDays.length || 1;
  const dayBobots: number[] = new Array(numDays).fill(0);

  // 4. Assign each task to the day with lowest current bobot
  const assignments: { task: Task; dayIndex: number }[] = [];
  for (const task of sortedTasks) {
    let minIdx = 0;
    for (let i = 1; i < numDays; i++) {
      if (dayBobots[i] < dayBobots[minIdx]) minIdx = i;
    }
    assignments.push({ task, dayIndex: minIdx });
    dayBobots[minIdx] += task.bobot;
  }

  // 5. Build scheduled tasks and day summaries
  const scheduled: ScheduledTask[] = assignments.map(({ task, dayIndex }) => ({
    id: task.id,
    bobot: task.bobot,
    prioritas: task.prioritas,
    keterangan: task.keterangan,
    tanggal: toDateString(workDays[dayIndex]),
  }));

  const daySummaries: DaySummary[] = workDays.map((d, i) => ({
    tanggal: toDateString(d),
    totalBobot: Math.round(dayBobots[i] * 100) / 100,
    tasks: scheduled.filter((s) => s.tanggal === toDateString(d)),
  }));

  return {
    scheduled,
    daySummaries,
    totalBobot: Math.round(totalBobot * 100) / 100,
  };
}

export { DAY_NAMES };
