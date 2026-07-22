/**
 * Minimal client for a self-hosted GitLab instance (git.uns.ac.id) used to
 * pull a user's changes down to file level for logbook generation.
 *
 * All calls are read-only against the GitLab REST API (`/api/v4`). Nothing
 * here persists data anywhere — every function is a stateless fetch.
 */

export interface GitlabConfig {
  baseUrl: string;
  token: string;
  /** Project ids or URL-encoded paths (e.g. "group/subgroup/repo") to scan. */
  projectRefs: string[];
  authorEmail: string;
}

export interface GitCommit {
  id: string;
  short_id: string;
  title: string;
  message: string;
  author_name: string;
  author_email: string;
  authored_date: string; // ISO
  parent_ids: string[];
}

export interface GitFileChange {
  project: string;
  /** Human-readable app/repo name (from GitLab, not just the configured ref). */
  appName: string;
  commitId: string;
  commitShortId: string;
  commitTitle: string;
  date: string; // YYYY-MM-DD (local to the commit's authored_date)
  path: string;
  isNewFile: boolean;
  isDeletedFile: boolean;
  isRenamed: boolean;
  diff: string;
  /** Rough size of the change, counted from unified-diff +/- lines. */
  changedLines: number;
}

export function loadGitlabConfigFromEnv(): GitlabConfig {
  const baseUrl = (process.env.GITLAB_BASE_URL || "https://git.uns.ac.id").replace(/\/+$/, "");
  const token = process.env.GITLAB_TOKEN || "";
  const authorEmail = process.env.GITLAB_AUTHOR_EMAIL || "dihaw@staff.uns.ac.id";
  // Optional now: projects can instead be picked at generate-time from the
  // starred-projects dropdown (see listStarredProjects / fetchFileChanges).
  const rawProjects = process.env.GITLAB_PROJECT_IDS || process.env.GITLAB_PROJECT_ID || "";
  const projectRefs = rawProjects
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!token) {
    throw new Error("GITLAB_TOKEN belum di-set di .env");
  }

  return { baseUrl, token, projectRefs, authorEmail };
}

function encodeProjectRef(ref: string): string {
  // Numeric ids pass through untouched; path refs ("group/repo") must be
  // percent-encoded as a single path segment for the GitLab API.
  return /^\d+$/.test(ref) ? ref : encodeURIComponent(ref);
}

async function gitlabFetch<T>(config: Pick<GitlabConfig, "baseUrl" | "token">, path: string): Promise<T> {
  const url = `${config.baseUrl}/api/v4${path}`;
  const res = await fetch(url, {
    headers: { "PRIVATE-TOKEN": config.token },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitLab API ${res.status} ${res.statusText} on ${path}: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

function toLocalDateString(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface RawProject {
  name: string;
  path: string;
}

/** Resolves a project ref (id or path) to its human-readable GitLab name (falls back to the ref itself on failure). */
async function getProjectName(config: GitlabConfig, projectRef: string): Promise<string> {
  try {
    const encodedRef = encodeProjectRef(projectRef);
    const project = await gitlabFetch<RawProject>(config, `/projects/${encodedRef}`);
    return project.name || project.path || projectRef;
  } catch {
    return projectRef;
  }
}

export interface GitlabStarredProject {
  id: number;
  name: string;
  pathWithNamespace: string;
}

interface RawStarredProject {
  id: number;
  name: string;
  path_with_namespace: string;
}

/** Lists projects starred by the token's owner — used to populate the repo picker dropdown instead of hardcoding GITLAB_PROJECT_IDS. */
export async function listStarredProjects(
  config: Pick<GitlabConfig, "baseUrl" | "token">
): Promise<GitlabStarredProject[]> {
  const projects: GitlabStarredProject[] = [];
  const perPage = 100;
  let page = 1;

  while (true) {
    const qs = new URLSearchParams({
      starred: "true",
      simple: "true",
      order_by: "last_activity_at",
      per_page: String(perPage),
      page: String(page),
    });
    const batch = await gitlabFetch<RawStarredProject[]>(config, `/projects?${qs.toString()}`);
    if (batch.length === 0) break;
    for (const p of batch) {
      projects.push({ id: p.id, name: p.name, pathWithNamespace: p.path_with_namespace });
    }
    if (batch.length < perPage) break;
    page += 1;
  }

  return projects;
}

/** List commits authored by `config.authorEmail` within [since, until], across all branches. */
async function listCommitsForProject(
  config: GitlabConfig,
  projectRef: string,
  since: Date,
  until: Date
): Promise<GitCommit[]> {
  const encodedRef = encodeProjectRef(projectRef);
  const sinceIso = since.toISOString();
  // Extend `until` to end-of-day so the whole selected day is included.
  const untilDate = new Date(until);
  untilDate.setHours(23, 59, 59, 999);
  const untilIso = untilDate.toISOString();

  const commits: GitCommit[] = [];
  const perPage = 100;
  let page = 1;

  // GitLab's /repository/commits supports `all=true` (all branches) but not
  // a reliable author filter server-side across versions, so filter here.
  while (true) {
    const qs = new URLSearchParams({
      since: sinceIso,
      until: untilIso,
      all: "true",
      per_page: String(perPage),
      page: String(page),
    });
    const batch = await gitlabFetch<GitCommit[]>(
      config,
      `/projects/${encodedRef}/repository/commits?${qs.toString()}`
    );
    if (batch.length === 0) break;
    for (const c of batch) {
      // Merge commits (2+ parents) are excluded: their diff is computed
      // against the first parent and so re-shows the same file changes
      // already introduced by the individual commits being merged in,
      // which would otherwise duplicate every logbook entry.
      const isMergeCommit = (c.parent_ids?.length ?? 0) > 1;
      if (isMergeCommit) continue;
      if ((c.author_email || "").toLowerCase() === config.authorEmail.toLowerCase()) {
        commits.push(c);
      }
    }
    if (batch.length < perPage) break;
    page += 1;
  }

  return commits;
}

interface RawDiffEntry {
  old_path: string;
  new_path: string;
  new_file: boolean;
  renamed_file: boolean;
  deleted_file: boolean;
  diff: string;
}

function countChangedLines(diff: string): number {
  let count = 0;
  for (const line of diff.split("\n")) {
    if (
      (line.startsWith("+") && !line.startsWith("+++")) ||
      (line.startsWith("-") && !line.startsWith("---"))
    ) {
      count += 1;
    }
  }
  return count;
}

async function getCommitFileChanges(
  config: GitlabConfig,
  projectRef: string,
  appName: string,
  commit: GitCommit
): Promise<GitFileChange[]> {
  const encodedRef = encodeProjectRef(projectRef);
  const entries = await gitlabFetch<RawDiffEntry[]>(
    config,
    `/projects/${encodedRef}/repository/commits/${commit.id}/diff?per_page=100`
  );

  const date = toLocalDateString(commit.authored_date);

  return entries.map((e) => ({
    project: projectRef,
    appName,
    commitId: commit.id,
    commitShortId: commit.short_id,
    commitTitle: commit.title,
    date,
    path: e.new_path || e.old_path,
    isNewFile: e.new_file,
    isDeletedFile: e.deleted_file,
    isRenamed: e.renamed_file,
    diff: e.diff || "",
    changedLines: countChangedLines(e.diff || ""),
  }));
}

/**
 * Fetch every file-level change authored by `config.authorEmail` across the
 * given projects (or `config.projectRefs` from .env if none are passed)
 * within [since, until]. This is read-only and does not write anything
 * anywhere.
 */
export async function fetchFileChanges(
  config: GitlabConfig,
  since: Date,
  until: Date,
  projectRefsOverride?: string[]
): Promise<GitFileChange[]> {
  const allChanges: GitFileChange[] = [];
  const projectRefs =
    projectRefsOverride && projectRefsOverride.length > 0 ? projectRefsOverride : config.projectRefs;

  if (projectRefs.length === 0) {
    throw new Error(
      "Tidak ada project yang dipilih — pilih repo dari daftar starred project, atau set GITLAB_PROJECT_IDS di .env."
    );
  }

  for (const projectRef of projectRefs) {
    const appName = await getProjectName(config, projectRef);
    const commits = await listCommitsForProject(config, projectRef, since, until);
    for (const commit of commits) {
      const changes = await getCommitFileChanges(config, projectRef, appName, commit);
      allChanges.push(...changes);
    }
  }

  return allChanges;
}
