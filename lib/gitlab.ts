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

  if (!token) {
    throw new Error("GITLAB_TOKEN belum di-set di .env");
  }

  return { baseUrl, token, authorEmail };
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

/** Lists projects starred by the token's owner — used to populate the repo picker dropdown the user selects from per generation. */
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
 * Runs `fn` over `items` with at most `limit` calls in flight at once,
 * preserving input order in the result. Used to parallelize GitLab requests
 * without firing hundreds at the self-hosted server simultaneously.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Max projects resolved concurrently (name + commit list). */
const PROJECT_CONCURRENCY = 5;
/** Max per-commit diff requests in flight at once. */
const DIFF_CONCURRENCY = 8;

/**
 * Fetch every file-level change authored by `config.authorEmail` across the
 * explicitly selected `projectRefs` within [since, until]. At least one repo
 * must be selected — there is no `.env` fallback. Requests are parallelized
 * (bounded) and commits are de-duplicated by id, so cost scales with the
 * number of *unique* commits rather than round-trips done one at a time.
 * Read-only; nothing is written anywhere.
 */
export async function fetchFileChanges(
  config: GitlabConfig,
  since: Date,
  until: Date,
  projectRefs: string[]
): Promise<GitFileChange[]> {
  if (!projectRefs || projectRefs.length === 0) {
    throw new Error(
      "Tidak ada project yang dipilih — pilih minimal satu repo dari daftar starred project."
    );
  }

  // Phase 1: per project, resolve the display name and list its commits.
  // Runs across projects in parallel; the two calls per project also run
  // together since they don't depend on each other.
  const perProject = await mapWithConcurrency(projectRefs, PROJECT_CONCURRENCY, async (projectRef) => {
    const [appName, commits] = await Promise.all([
      getProjectName(config, projectRef),
      listCommitsForProject(config, projectRef, since, until),
    ]);
    // `all=true` can surface the same commit on several branches — dedup by
    // id so its diff is fetched (and logged) only once.
    const uniqueCommits = [...new Map(commits.map((c) => [c.id, c])).values()];
    return uniqueCommits.map((commit) => ({ projectRef, appName, commit }));
  });

  // Phase 2: fetch every commit's file-level diffs, bounded in parallel.
  const tasks = perProject.flat();
  const changesPerCommit = await mapWithConcurrency(tasks, DIFF_CONCURRENCY, ({ projectRef, appName, commit }) =>
    getCommitFileChanges(config, projectRef, appName, commit)
  );

  return changesPerCommit.flat();
}
