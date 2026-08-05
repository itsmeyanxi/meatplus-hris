"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { listCrews } from "@/lib/crews";
import { PageHeader, AppInput } from "@/components/ui";

/**
 * Project Crews overview — one card per crew (BLAST, ICE, CUTTER, …) with headcount
 * and today's attendance at a glance. Mirrors the Agencies board. Clicking a card
 * opens the crew's live time-in/out board.
 */
export default function CrewsPage() {
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["crews"], queryFn: listCrews });
  const crews = data?.data ?? [];

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? crews.filter((b) => b.name.toLowerCase().includes(needle) || (b.code ?? "").toLowerCase().includes(needle))
      : crews.slice();
    return filtered.sort((a, b) => b.headcount - a.headcount || a.name.localeCompare(b.name));
  }, [crews, q]);

  const totalHead = useMemo(() => crews.reduce((s, b) => s + b.headcount, 0), [crews]);
  const totalPresent = useMemo(() => crews.reduce((s, b) => s + b.present_today, 0), [crews]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Project Crews"
        description={`${crews.length} crew${crews.length === 1 ? "" : "s"} · ${totalHead} workers · ${totalPresent} present today.`}
      />

      <div className="max-w-sm">
        <AppInput placeholder="Search crews…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />)}
        </div>
      )}

      {!isLoading && rows.length === 0 && (
        <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
          No crews found.
        </p>
      )}

      {!isLoading && rows.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((b) => {
            const pct = b.headcount > 0 ? Math.round((b.present_today / b.headcount) * 100) : 0;
            return (
              <Link
                key={b.id}
                href={`/crews/${b.id}`}
                className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-900 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-base font-semibold text-slate-900">{b.name}</span>
                      {b.code && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-500">{b.code}</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{b.headcount} {b.headcount === 1 ? "worker" : "workers"}</p>
                  </div>
                  <span className="shrink-0 text-3xl font-bold tabular-nums text-slate-900">{b.headcount}</span>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-emerald-700">{b.present_today} present today</span>
                    <span className="text-slate-400">{pct}%</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>

                <p className="mt-3 text-xs font-medium text-slate-400 group-hover:text-slate-700">Open board →</p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
