"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { listEmployees, type EmployeeListItem } from "@/lib/employees";

/**
 * Type-to-search employee picker. Unlike a plain <select> capped at the first N
 * employees, this queries the API as you type, so every employee is reachable.
 */
export function EmployeeSearchSelect({
  value,
  onChange,
  placeholder = "All employees",
  companyId,
  className = "",
}: {
  value: number | "";
  onChange: (id: number | "", label?: string) => void;
  placeholder?: string;
  companyId?: number | "";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selectedLabel, setSelectedLabel] = useState<string>("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(t);
  }, [term]);

  // Close on outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ["employee-search", debounced, companyId],
    queryFn: () => listEmployees({ q: debounced || undefined, companyId, perPage: 20 }),
    enabled: open,
    staleTime: 30_000,
  });

  const results = data?.data ?? [];

  const pick = (e: EmployeeListItem | null) => {
    if (!e) { onChange("", ""); setSelectedLabel(""); }
    else { onChange(e.id, `${e.employee_no} — ${e.full_name}`); setSelectedLabel(`${e.employee_no} — ${e.full_name}`); }
    setOpen(false);
    setTerm("");
  };

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm outline-none focus:border-teal-500"
      >
        <span className={value === "" ? "text-slate-400" : "text-slate-800"}>
          {value === "" ? placeholder : selectedLabel || `#${value}`}
        </span>
        <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 p-2">
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <input
              autoFocus
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search name or ID…"
              className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-teal-500"
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
            {results.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => pick(e)}
                  className={`flex w-full flex-col px-3 py-1.5 text-left hover:bg-slate-50 ${e.id === value ? "bg-teal-50" : ""}`}
                >
                  <span className="font-medium text-slate-800">{e.full_name}</span>
                  <span className="font-mono text-xs text-slate-400">{e.employee_no}{e.company ? ` · ${e.company.code}` : ""}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
