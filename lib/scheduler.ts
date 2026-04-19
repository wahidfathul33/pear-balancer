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

/**
 * Day-affinity config: task id → preferred day range (0-indexed).
 * "early" = prefer days in the first half of the week.
 * "late"  = prefer days in the second half of the week.
 */
const DAY_AFFINITY: Record<number, "early" | "late" | "none"> = {
  5091: "early", // Memelihara sistem → muncul lebih banyak di awal minggu
  5089: "late",  // Evaluasi sistem   → muncul lebih banyak di akhir minggu
};

/**
 * Penalty added to a day's effective load when the task's affinity
 * does NOT match the day's position. Higher = stronger preference.
 */
const AFFINITY_PENALTY = 3;

/**
 * Penalty per existing task with the same ID already placed on that day.
 * Makes the scheduler spread duplicate-ID tasks across different days.
 * Set higher than AFFINITY_PENALTY so spread takes priority over affinity
 * when a day is already "full" of the same task type.
 */
const SPREAD_PENALTY = 5;

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
  const cur = new Date(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate()
  );
  const end = new Date(
    endDate.getFullYear(),
    endDate.getMonth(),
    endDate.getDate()
  );
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

/**
 * Returns an effective load score for placing `task` on day at `dayIndex`.
 *
 * Score components:
 * 1. Base      = actual accumulated bobot (keeps days balanced).
 * 2. Spread    = SPREAD_PENALTY × how many tasks with the same ID are
 *                already on this day → pushes duplicates to other days.
 * 3. Affinity  = AFFINITY_PENALTY when the day is on the "wrong" side
 *                for tasks that prefer early or late days.
 *
 * Only the score influences day selection; dayBobots is always updated
 * with the real bobot so totals stay balanced.
 */
function effectiveScore(
  task: Task,
  dayIndex: number,
  numDays: number,
  dayBobots: number[],
  dayIdCounts: Map<number, number>[]
): number {
  // 1. Base load
  let score = dayBobots[dayIndex];

  // 2. Spread penalty: discourage same-ID tasks on the same day
  const existingCount = dayIdCounts[dayIndex].get(task.id) ?? 0;
  score += existingCount * SPREAD_PENALTY;

  // 3. Affinity penalty
  const affinity = DAY_AFFINITY[task.id];
  if (affinity && affinity !== "none") {
    const midpoint = (numDays - 1) / 2;
    const isEarlyDay = dayIndex <= Math.floor(midpoint);
    const isLateDay = dayIndex >= Math.ceil(midpoint);
    if (affinity === "early" && !isEarlyDay) score += AFFINITY_PENALTY;
    if (affinity === "late" && !isLateDay) score += AFFINITY_PENALTY;
  }

  return score;
}

export function generateSchedule(
  tasks: Task[],
  startDate: Date,
  endDate: Date
): {
  scheduled: ScheduledTask[];
  daySummaries: DaySummary[];
  totalBobot: number;
} {
  // ── 1. Trim to MAX_BOBOT ────────────────────────────────────────────────
  let totalBobot = tasks.reduce((s, t) => s + t.bobot, 0);
  let workingTasks = [...tasks];

  if (totalBobot > MAX_BOBOT) {
    // Remove fillers (priority 0) first (heaviest first), then lightest mains
    const sorted = [...tasks].sort((a, b) => {
      const pa = normPriority(a.prioritas);
      const pb = normPriority(b.prioritas);
      if (pa === 0 && pb === 0) return b.bobot - a.bobot;
      if (pa === 0) return -1;
      if (pb === 0) return 1;
      return a.bobot - b.bobot;
    });

    const trimmed: Task[] = [];
    let acc = 0;
    for (const t of sorted) {
      if (acc + t.bobot <= MAX_BOBOT) {
        trimmed.push(t);
        acc += t.bobot;
      }
    }
    workingTasks = trimmed;
    totalBobot = acc;
  }

  // ── 2. Sort tasks: main (priority > 0) then fillers ────────────────────
  const mainTasks = workingTasks
    .filter((t) => normPriority(t.prioritas) > 0)
    .sort((a, b) => {
      const pa = normPriority(a.prioritas);
      const pb = normPriority(b.prioritas);
      if (pa !== pb) return pa - pb; // priority ASC (1 = paling awal diproses)
      return b.bobot - a.bobot;     // bobot DESC sebagai tie-breaker
    });

  const fillerTasks = workingTasks
    .filter((t) => normPriority(t.prioritas) === 0)
    .sort((a, b) => a.bobot - b.bobot); // bobot ASC

  const sortedTasks = [...mainTasks, ...fillerTasks];

  // ── 3. Get work days ────────────────────────────────────────────────────
  const workDays = getWorkDays(startDate, endDate);
  const numDays = workDays.length || 1;
  const dayBobots: number[] = new Array(numDays).fill(0);

  // ── 4. Assign each task using affinity + spread aware score ────────────
  const assignments: { task: Task; dayIndex: number }[] = [];
  // Track how many times each task ID has been assigned per day
  const dayIdCounts: Map<number, number>[] = Array.from(
    { length: numDays },
    () => new Map()
  );

  for (const task of sortedTasks) {
    let bestIdx = 0;
    let bestScore = effectiveScore(task, 0, numDays, dayBobots, dayIdCounts);

    for (let i = 1; i < numDays; i++) {
      const score = effectiveScore(task, i, numDays, dayBobots, dayIdCounts);
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    assignments.push({ task, dayIndex: bestIdx });
    dayBobots[bestIdx] += task.bobot;
    // Update ID count for the chosen day
    dayIdCounts[bestIdx].set(
      task.id,
      (dayIdCounts[bestIdx].get(task.id) ?? 0) + 1
    );
  }

  // ── 5. Build output ─────────────────────────────────────────────────────
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