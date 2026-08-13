"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { listEmployees, type EmployeeListItem } from "@/lib/employees";

/**
 * Type-to-search employee picker. Unlike a plain <select> capped at the first N
 * employees, this queries the API as you type, so every employee is reachable.
 *
 * The results panel is rendered in a portal with fixed positioning so it floats
 * above surrounding cards/tables and is never clipped by an ancestor's overflow
 * or stacking context.
 */
export function EmployeeSearchSelect({
  value,
  onChange,
  placeholder = "All employees",
  companyId,
  scope,
  className = "",
  initialLabel = "",
}: {
  value: number | "";
  onChange: (id: number | "", label?: string) => void;
  placeholder?: string;
  companyId?: number | "";
  /** Which set to search: organic (default), agency, or all (both). */
  scope?: "organic" | "agency" | "all";
  className?: string;
  /** Label to show for a pre-selected value (e.g. an existing manager), until changed. */
  initialLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [active, setActive] = useState(0);
  const [selectedLabel, setSelectedLabel] = useState<string>(initialLabel);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(t);
  }, [term]);

  const updateRect = () => {
    const r = boxRef.current?.getBoundingClientRect();
    if (r) setRect({ top: r.bottom + 4, left: r.left, width: r.width });
  };

  useEffect(() => {
    if (!open) return;
    updateRect();
    const h = () => updateRect();
    window.addEventListener("scroll", h, true);
    window.addEventListener("resize", h);
    return () => {
      window.removeEventListener("scroll", h, true);
      window.removeEventListener("resize", h);
    };
  }, [open]);

  // Close on outside click (accounting for the portalled panel).
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (boxRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ["employee-search", debounced, companyId, scope],
    queryFn: () => listEmployees({ q: debounced || undefined, companyId, scope, perPage: 20 }),
    enabled: open,
    staleTime: 30_000,
  });

  const results = data?.data ?? [];
  const total = data?.meta?.total ?? results.length;

  const pick = (e: EmployeeListItem | null) => {
    if (!e) { onChange("", ""); setSelectedLabel(""); }
    else { onChange(e.id, `${e.employee_no} — ${e.full_name}`); setSelectedLabel(`${e.employee_no} — ${e.full_name}`); }
    setOpen(false);
    setTerm("");
  };

  const openList = () => { updateRect(); setOpen(true); };

  // Reset the highlight when the result set changes, and keep it in view.
  useEffect(() => { setActive(0); }, [debounced, open]);
  useEffect(() => {
    if (!open) return;
    document.getElementById(`emp-opt-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (results[active]) pick(results[active]); }
    else if (e.key === "Escape") { setOpen(false); setTerm(""); }
  };

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openList())}
        className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm outline-none focus:border-brand-500"
      >
        <span className={value === "" ? "text-slate-400" : "text-slate-800"}>
          {value === "" ? placeholder : selectedLabel || `#${value}`}
        </span>
        <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && rect && typeof document !== "undefined" && createPortal(
        <div
          ref={panelRef}
          style={{ position: "fixed", top: rect.top, left: rect.left, width: rect.width, zIndex: 9999 }}
          className="rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          <div className="border-b border-slate-100 p-2">
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <input
              autoFocus
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search name or ID…"
              className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-brand-500"
            />
          </div>
          <ul className="max-h-64 overflow-y-auto py-1 text-sm">
            <li>
              <button type="button" onClick={() => pick(null)} className="flex w-full items-center px-3 py-1.5 text-left text-slate-500 hover:bg-slate-50">
                {placeholder}
              </button>
            </li>
            {isFetching && results.length === 0 && (
              <li className="px-3 py-2 text-xs text-slate-400">Searching…</li>
            )}
            {!isFetching && results.length === 0 && debounced && (
              <li className="px-3 py-2 text-xs text-slate-400">No matches for “{debounced}”.</li>
            )}
            {results.map((e, i) => (
              <li key={e.id}>
                <button
                  id={`emp-opt-${i}`}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(e)}
                  className={`flex w-full flex-col px-3 py-1.5 text-left ${i === active ? "bg-slate-50" : ""} ${e.id === value ? "bg-brand-50" : ""}`}
                >
                  <span className="font-medium text-slate-800">{e.full_name}</span>
                  <span className="font-mono text-xs text-slate-400">{e.employee_no}{e.company ? ` · ${e.company.code}` : ""}</span>
                </button>
              </li>
            ))}
            {total > results.length && (
              <li className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-400">
                Showing first {results.length} of {total} — keep typing to narrow.
              </li>
            )}
          </ul>
        </div>,
        document.body,
      )}
    </div>
  );
}
