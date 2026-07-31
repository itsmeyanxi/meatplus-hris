"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { employeeExportUrl } from "@/lib/employees";
import { listAgencies } from "@/lib/agencies";
import { useBranchTerm } from "@/lib/terminology";
import { ImportEmployeesModal } from "@/components/employees/ImportEmployeesModal";
import { PageHeader, AppInput } from "@/components/ui";

/**
 * Agencies overview — one card per agency with headcount and today's attendance
 * (present-so-far) at a glance. Clicking a card opens the agency's live board +
 * report generator.
 */
export default function AgenciesPage() {
  const term = useBranchTerm();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [showImport, setShowImport] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ["agencies"], queryFn: listAgencies });
  const agencies = data?.data ?? [];

  const onExport = () => {
    const a = document.createElement("a");
    a.href = employeeExportUrl({ scope: "agency" });
    a.download = "agency_workers.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? agencies.filter((b) => b.name.toLowerCase().includes(needle) || (b.code ?? "").toLowerCase().includes(needle))
      : agencies.slice();
    return filtered.sort((a, b) => b.headcount - a.headcount);
  }, [agencies, q]);

  const totalHead = useMemo(() => agencies.reduce((s, b) => s + b.headcount, 0), [agencies]);
  const totalPresent = useMemo(() => agencies.reduce((s, b) => s + b.present_today, 0), [agencies]);

  return (
    <div className="space-y-4">
      <PageHeader
        title={term.Plural}
        description={`${agencies.length} ${agencies.length === 1 ? term.singular : term.plural} · ${totalHead} workers · ${totalPresent} present today.`}
        actions={
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowImport(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Import {term.plural}
            </button>
            <button type="button" onClick={onExport}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Export {term.plural}
            </button>
          </div>
        }
      />

      <div className="max-w-sm">
        <AppInput placeholder={`Search ${term.plural}…`} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />)}
        </div>
      )}

      {!isLoading && rows.length === 0 && (
        <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
          No {term.plural} found.
        </p>
      )}

      {!isLoading && rows.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((b) => {
            const pct = b.headcount > 0 ? Math.round((b.present_today / b.headcount) * 100) : 0;
            return (
              <Link
                key={b.id}
                href={`/agencies/${b.id}`}
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

                {/* Present-today bar */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-emerald-700">{b.present_today} present today</span>
                    <span className="text-slate-400">{pct}%</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>

                <p className="mt-3 text-xs font-medium text-slate-400 group-hover:text-slate-700">Open board &amp; report →</p>
              </Link>
            );
          })}
        </div>
      )}

      {showImport && (
        <ImportEmployeesModal
          mode="agency"
          companies={[]}
          onClose={() => setShowImport(false)}
          onDone={() => qc.invalidateQueries({ queryKey: ["agencies"] })}
        />
      )}
    </div>
  );
}
