"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MENU_ITEMS = [
  { href: "/", label: "Generate Jadwal" },
  { href: "/logbook", label: "Generate Logbook" },
  { href: "/uraian-jadwal", label: "Generate Uraian Jadwal" },
];

export function NavMenu() {
  const pathname = usePathname();

  return (
    <nav className="bg-slate-900 border-b border-slate-700 shadow-lg shadow-slate-950/20">
      <div className="w-[80%] mx-auto flex gap-1 overflow-x-auto">
        {MENU_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "px-4 py-3 text-sm font-semibold border-b-2 transition-colors",
                active
                  ? "border-cyan-400 text-cyan-300"
                  : "border-transparent text-slate-400 hover:text-slate-100 hover:border-slate-500",
              ].join(" ")}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
