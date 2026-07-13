"use client";

import type { ReactNode } from "react";

/**
 * An always-open section, styled like the employee-registration section list
 * (numbered, icon on the left, title + description) but with its content always
 * shown — no accordion collapse.
 */
export function SectionShell({
  index,
  icon,
  title,
  description,
  children,
}: {
  index: number;
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-white">
      <div className="flex w-full items-center gap-4 px-5 py-4">
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
      </div>
      <div className="border-t border-slate-100 px-5 py-5">{children}</div>
    </div>
  );
}
