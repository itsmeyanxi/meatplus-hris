"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listCrews } from "@/lib/crews";
import { employeeExportUrl } from "@/lib/employees";
import { ImportEmployeesModal } from "@/components/employees/ImportEmployeesModal";
import { PageHeader, AppInput } from "@/components/ui";

/**
 * Project Crews overview — one card per crew (BLAST, ICE, CUTTER, …) with headcount
 * and today's attendance at a glance. Mirrors the Agencies board. Clicking a card
 * opens the crew's live time-in/out board.
 */
export default function CrewsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [showImport, setShowImport] = useState(false);
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

  const onExport = () => {
    const a = document.createElement("a");
    a.href = employeeExportUrl({ scope: "project_crew" });
    a.download = "project_crew_workers.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Project Crews"
        description={`${crews.length} crew${crews.length === 1 ? "" : "s"} · ${totalHead} workers · ${totalPresent} present today.`}
        actions={
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowImport(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Import crews
            </button>
            <button type="button" onClick={onExport}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Export crews
            </button>
          </div>
        }
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

      {showImport && (
        <ImportEmployeesModal
          mode="project_crew"
          companies={[]}
          onClose={() => setShowImport(false)}
          onDone={() => qc.invalidateQueries({ queryKey: ["crews"] })}
        />
      )}
    </div>
  );
}
