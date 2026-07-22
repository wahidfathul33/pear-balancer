"use client";

import { useEffect, useRef, useState } from "react";

export interface StarredProject {
  id: number;
  name: string;
  pathWithNamespace: string;
}

export function ProjectPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (refs: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<StarredProject[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/gitlab-projects")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
        } else {
          setProjects(data.projects);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Gagal memuat starred project");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  function toggle(pathWithNamespace: string) {
    if (selected.includes(pathWithNamespace)) {
      onChange(selected.filter((s) => s !== pathWithNamespace));
    } else {
      onChange([...selected, pathWithNamespace]);
    }
  }

  const filtered = (projects || []).filter((p) =>
    p.pathWithNamespace.toLowerCase().includes(query.toLowerCase())
  );

  const label =
    selected.length === 0
      ? "Semua repo (default .env)"
      : selected.length === 1
      ? selected[0]
      : `${selected.length} repo dipilih`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-left"
      >
        <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.958a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.368 2.446a1 1 0 00-.363 1.118l1.287 3.957c.3.922-.755 1.688-1.539 1.118l-3.367-2.446a1 1 0 00-1.176 0l-3.367 2.446c-.783.57-1.838-.196-1.539-1.118l1.287-3.957a1 1 0 00-.364-1.118L2.06 9.385c-.783-.57-.38-1.81.588-1.81h4.163a1 1 0 00.95-.69l1.286-3.958z" />
        </svg>
        <span className="truncate text-gray-700 text-xs font-mono">{label}</span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 bg-white rounded-2xl shadow-xl border border-gray-100 p-3 w-80">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari repo…"
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs mb-2 text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {loading && <p className="text-xs text-gray-400 px-1 py-2">Memuat starred project…</p>}
          {error && <p className="text-xs text-red-500 px-1 py-2">{error}</p>}
          {!loading && !error && filtered.length === 0 && (
            <p className="text-xs text-gray-400 px-1 py-2">Tidak ada starred project ditemukan.</p>
          )}

          <div className="max-h-60 overflow-y-auto flex flex-col gap-0.5">
            {filtered.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer text-xs"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(p.pathWithNamespace)}
                  onChange={() => toggle(p.pathWithNamespace)}
                  className="accent-blue-600"
                />
                <span className="truncate text-gray-700">{p.pathWithNamespace}</span>
              </label>
            ))}
          </div>

          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-2 w-full text-xs text-gray-400 hover:text-red-500 transition-colors text-center"
            >
              Kosongkan pilihan (pakai default .env)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
