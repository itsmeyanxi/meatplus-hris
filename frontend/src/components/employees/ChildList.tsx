"use client";

import type { ReactNode } from "react";

export function ChildListShell({
  title,
  count,
  toggle,
  isAdding,
  children,
}: {
  title: string;
  count: number;
  toggle: () => void;
  isAdding: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">
          {title} <span className="font-normal text-slate-500">({count})</span>
        </h3>
        <button
          onClick={toggle}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
        >
          {isAdding ? "Cancel" : "+ Add"}
        </button>
      </div>
      {children}
    </div>
  );
}

export function EmptyRow({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

export const inputCls =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500";
