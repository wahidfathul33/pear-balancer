import { NextRequest, NextResponse } from "next/server";
import { generateUraianJadwal } from "@/lib/uraian-jadwal";
import { LogbookEntry } from "@/lib/logbook";
import { ScheduledTask } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

/**
 * POST /api/uraian-jadwal
 * Body: { scheduled: ScheduledTask[], commitStartDate: "YYYY-MM-DD", commitEndDate: "YYYY-MM-DD",
 *         projectRefs: string[], logbookEntries?: LogbookEntry[] }
 *
 * Stateless: enriches an already-generated jadwal with per-row "Uraian
 * Aktivitas" sourced from GitLab commits (id 5090 excepted). Nothing is
 * persisted to a database.
 */
export async function POST(req: NextRequest) {
  let body: {
    scheduled?: ScheduledTask[];
    commitStartDate?: string;
    commitEndDate?: string;
    projectRefs?: string[];
    logbookEntries?: LogbookEntry[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body harus berupa JSON" }, { status: 400 });
  }

  const { scheduled, commitStartDate, commitEndDate, projectRefs, logbookEntries } = body;
  if (!scheduled || scheduled.length === 0) {
    return NextResponse.json({ error: "scheduled wajib diisi dan tidak boleh kosong" }, { status: 400 });
  }
  if (!commitStartDate || !commitEndDate) {
    return NextResponse.json(
      { error: "commitStartDate dan commitEndDate wajib diisi (format YYYY-MM-DD)" },
      { status: 400 }
    );
  }
  if (!projectRefs || projectRefs.length === 0) {
    return NextResponse.json({ error: "Pilih minimal satu repo GitLab" }, { status: 400 });
  }

  const start = new Date(`${commitStartDate}T00:00:00`);
  const end = new Date(`${commitEndDate}T00:00:00`);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return NextResponse.json({ error: "Rentang tanggal commit GitLab tidak valid" }, { status: 400 });
  }

  try {
    const result = await generateUraianJadwal({
      scheduled,
      commitStartDate: start,
      commitEndDate: end,
      projectRefs,
      logbookEntries: Array.isArray(logbookEntries) ? logbookEntries.slice(0, 500) : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tidak diketahui";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
