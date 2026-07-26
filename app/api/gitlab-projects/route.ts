import { NextResponse } from "next/server";
import { listStarredProjects, loadGitlabConfigFromEnv } from "@/lib/gitlab";

export const dynamic = "force-dynamic";

/**
 * GET /api/gitlab-projects
 * Lists projects starred by the configured GitLab token's owner, so the
 * logbook page can offer them as a dropdown for the user to pick from per
 * generation.
 */
export async function GET() {
  try {
    const config = loadGitlabConfigFromEnv();
    const projects = await listStarredProjects(config);
    return NextResponse.json({ projects });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tidak diketahui";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
