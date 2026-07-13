"use client";

import { useState, type ReactNode } from "react";

/**
 * A collapsible section, styled like the employee-registration section list
 * (numbered, icon on the left, title + description). Each is its own card and
 * toggles independently; defaults to open.
 */
export function SectionShell({
  index,
  icon,
  title,
  description,
  defaultOpen = true,
  children,
}: {
  index: number;
  icon: ReactNode;
  title: string;
  description: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-4 px-5 py-4 text-left transition ${open ? "bg-slate-50/60" : "hover:bg-slate-50"}`}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400">{String(index).padStart(2, "0")}</span>
            <span className="text-sm font-semibold text-slate-800">{title}</span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        </div>
        <svg
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && <div className="border-t border-slate-100 px-5 py-5">{children}</div>}
    </div>
  );
}
