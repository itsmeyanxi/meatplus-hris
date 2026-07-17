"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { listEmployees } from "@/lib/employees";

type PageItem = { label: string; href: string; group: string };

// Common destinations reachable from the palette.
const PAGES: PageItem[] = [
  { label: "Dashboard", href: "/dashboard", group: "Go to" },
  { label: "Employees", href: "/employees", group: "Go to" },
  { label: "Add Employee", href: "/employee-registration", group: "Go to" },
  { label: "Attendance — Matrix", href: "/attendance/dtr", group: "Go to" },
  { label: "Attendance — Time Logs", href: "/attendance/time-logs", group: "Go to" },
  { label: "Attendance — Uploads", href: "/attendance/uploads", group: "Go to" },
  { label: "Attendance — Requests", href: "/attendance/requests", group: "Go to" },
  { label: "Leaves", href: "/leaves", group: "Go to" },
  { label: "Overtimes", href: "/overtimes", group: "Go to" },
  { label: "Payroll", href: "/payroll", group: "Go to" },
  { label: "Reports", href: "/reports", group: "Go to" },
  { label: "Biometrics", href: "/devices", group: "Go to" },
  { label: "Branch Geofence", href: "/branch-geofence", group: "Go to" },
  { label: "Users", href: "/users", group: "Go to" },
  { label: "Settings", href: "/settings", group: "Go to" },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global Ctrl/Cmd+K to open, Esc to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) { setTerm(""); setActive(0); setTimeout(() => inputRef.current?.focus(), 20); }
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 200);
    return () => clearTimeout(t);
  }, [term]);

  const { data: empData } = useQuery({
    queryKey: ["cmdk-employees", debounced],
    queryFn: () => listEmployees({ q: debounced, perPage: 6 }),
    enabled: open && debounced.length > 0,
    staleTime: 30_000,
  });

  const pages = useMemo(() => {
    const q = debounced.toLowerCase();
    return q ? PAGES.filter((p) => p.label.toLowerCase().includes(q)) : PAGES.slice(0, 6);
  }, [debounced]);

  // Flat list for keyboard navigation: pages first, then employees.
  const items = useMemo(() => {
    const emps = (empData?.data ?? []).map((e) => ({
      type: "employee" as const, label: e.full_name, sub: `${e.employee_no}${e.company ? ` · ${e.company.code}` : ""}`, href: `/employees/${e.id}`,
    }));
    const pgs = pages.map((p) => ({ type: "page" as const, label: p.label, sub: p.href, href: p.href }));
    return [...pgs, ...emps];
  }, [pages, empData]);

  useEffect(() => { setActive(0); }, [debounced, empData]);

  const go = (href: string) => { setOpen(false); router.push(href); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (items[active]) go(items[active].href); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/40 p-4 pt-[12vh]" onClick={() => setOpen(false)}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-slate-100 px-4">
          <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
          </svg>
          <input
            ref={inputRef}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search employees or jump to a page…"
            className="w-full bg-transparent py-3.5 text-sm outline-none placeholder-slate-400"
          />
          <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">Esc</kbd>
        </div>

        <ul className="max-h-80 overflow-y-auto py-2">
          {items.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-slate-400">No matches.</li>
          )}
          {items.map((it, i) => (
            <li key={`${it.type}-${it.href}`}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(it.href)}
                className={`flex w-full items-center gap-3 px-4 py-2 text-left ${i === active ? "bg-slate-100" : ""}`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold ${it.type === "employee" ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-500"}`}>
                  {it.type === "employee" ? "👤" : "→"}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-800">{it.label}</span>
                  <span className="block truncate text-xs text-slate-400">{it.sub}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">
          <span>↑↓ to navigate · ↵ to open</span>
          <span>Ctrl/⌘ K</span>
        </div>
      </div>
    </div>
  );
}
