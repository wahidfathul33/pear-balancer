import { NextRequest, NextResponse } from "next/server";
import { generateLogbook } from "@/lib/logbook";

export const dynamic = "force-dynamic";

/**
 * POST /api/logbook
 * Body: { startDate: "YYYY-MM-DD", endDate: "YYYY-MM-DD", projectRefs?: string[] }
 *
 * Stateless: pulls changes from GitLab, classifies them via OpenRouter,
 * and returns the result directly. Nothing is persisted to a database.
 */
export async function POST(req: NextRequest) {
  let body: { startDate?: string; endDate?: string; projectRefs?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body harus berupa JSON" }, { status: 400 });
  }

  const { startDate, endDate, projectRefs } = body;
  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: "startDate dan endDate wajib diisi (format YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return NextResponse.json({ error: "Rentang tanggal tidak valid" }, { status: 400 });
  }

  try {
    const result = await generateLogbook({ startDate: start, endDate: end, projectRefs });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tidak diketahui";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
