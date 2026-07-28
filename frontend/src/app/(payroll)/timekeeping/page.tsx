"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader, TableShell } from "@/components/ui";
import { SearchSelect } from "@/components/SearchSelect";
import { TableSkeleton, EmptyState } from "@/components/feedback";
import { timekeepingApi, timekeepingExportUrl, FLOATING_LABELS, type TimekeepingRow } from "@/lib/payroll";
import { TimekeepingReviewDrawer } from "@/components/payroll/TimekeepingReviewDrawer";

function hrs(min: number): string {
  if (!min) return "—";
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

export default function PayrollTimekeepingPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [onlyFloating, setOnlyFloating] = useState(true);
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("");
  const [reviewId, setReviewId] = useState<number | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["payroll-timekeeping", from, to],
    queryFn: () => timekeepingApi.review(from || undefined, to || undefined),
  });

  // Department options built from what's actually in this cutoff.
  const deptOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of data?.items ?? []) if (r.department) set.add(r.department);
    return [{ value: "", label: "All departments" }, ...[...set].sort().map((d) => ({ value: d, label: d }))];
  }, [data]);

  const remind = useMutation({
    mutationFn: (row: TimekeepingRow) => timekeepingApi.remind(row.employee_id, from || undefined, to || undefined),
    onSuccess: (res) => (res.sent > 0 ? toast.success(res.message) : toast.info(res.message)),
    onError: () => toast.error("Couldn't send the reminder."),
  });

  const period = data?.period;
  const q = search.trim().toLowerCase();
  const rows = (data?.items ?? [])
    .filter((r) => (onlyFloating ? r.floating_total > 0 : true))
    .filter((r) => (dept ? r.department === dept : true))
    .filter((r) =>
      !q ||
      r.name.toLowerCase().includes(q) ||
      r.employee_no.toLowerCase().includes(q) ||
      (r.department ?? "").toLowerCase().includes(q) ||
      (r.head?.name ?? "").toLowerCase().includes(q),
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Timekeeping Review"
        description="Check each employee's attendance for the cutoff. Requests still waiting for approval are “floating” — they can still change pay, so clear them before you run payroll. Nudge the employee's head straight from here."
        actions={
          <a
            href={timekeepingExportUrl(from || undefined, to || undefined)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            title="Download this cutoff's timekeeping report (per employee) for the current company"
          >
            <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </a>
        }
      />

      {/* Controls */}
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {/* Search + department — the quick way to find someone */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee, ID, department, or head…"
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-teal-500"
            />
          </div>
          <div className="min-w-[200px]">
            <SearchSelect value={dept} onChange={setDept} options={deptOptions} placeholder="All departments" />
          </div>
        </div>
        {/* Cutoff + toggle */}
        <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
          <label className="text-xs font-medium text-slate-500">
            From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </label>
          <label className="text-xs font-medium text-slate-500">
            To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </label>
          <button onClick={() => refetch()} className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800">Apply cutoff</button>
          <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={onlyFloating} onChange={(e) => setOnlyFloating(e.target.checked)} className="rounded border-slate-300" />
            Only show floating approvals
          </label>
        </div>
      </div>

      {/* Summary */}
      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Employees this cutoff" value={data.summary.employees} />
          <Stat label="With floating approvals" value={data.summary.with_floating} tone={data.summary.with_floating > 0 ? "amber" : "slate"} />
          <Stat label="Floating requests total" value={data.summary.floating_total} tone={data.summary.floating_total > 0 ? "amber" : "slate"} />
        </div>
      )}
      {period && (
        <p className="text-xs text-slate-400">
          Cutoff: {period.from} → {period.to}
          {data ? ` · showing ${rows.length} of ${data.items.length}` : ""}
          {(search || dept) && <button onClick={() => { setSearch(""); setDept(""); }} className="ml-2 font-medium text-teal-600 hover:underline">clear filters</button>}
        </p>
      )}

      {isLoading ? (
        <TableSkeleton rows={6} />
      ) : rows.length === 0 ? (
        <EmptyState title={onlyFloating ? "No floating approvals" : "No timekeeping this cutoff"}
          message={onlyFloating ? "Everyone's attendance requests are cleared — safe to run payroll." : "No attendance recorded for the selected period."} />
      ) : (
        <TableShell>
          <table className="w-full min-w-[880px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Employee</th>
                <th className="px-4 py-2.5 text-center">Present</th>
                <th className="px-4 py-2.5 text-center">Absent</th>
                <th className="px-4 py-2.5 text-center">Late</th>
                <th className="px-4 py-2.5 text-center">OT</th>
                <th className="px-4 py-2.5">Floating approvals</th>
                <th className="px-4 py-2.5">Head to contact</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.map((r) => (
                <tr
                  key={r.employee_id}
                  onClick={() => setReviewId(r.employee_id)}
                  className={`cursor-pointer ${r.floating_total > 0 ? "bg-amber-50/40 hover:bg-amber-50" : "hover:bg-slate-50/60"}`}
                >
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-800">{r.name}</div>
                    <div className="text-xs text-slate-400">{r.employee_no}{r.department ? ` · ${r.department}` : ""}</div>
                  </td>
                  <td className="px-4 py-2.5 text-center tabular-nums text-slate-700">{r.attendance.present_days}/{r.attendance.scheduled_days}</td>
                  <td className="px-4 py-2.5 text-center tabular-nums">{r.attendance.absent_days > 0 ? <span className="font-semibold text-rose-600">{r.attendance.absent_days}</span> : "—"}</td>
                  <td className="px-4 py-2.5 text-center tabular-nums text-slate-600">{hrs(r.attendance.late_minutes)}</td>
                  <td className="px-4 py-2.5 text-center tabular-nums text-slate-600">{hrs(r.attendance.ot_minutes)}</td>
                  <td className="px-4 py-2.5">
                    {r.floating_total === 0 ? (
                      <span className="text-xs text-emerald-600">✓ cleared</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(r.floating).map(([k, n]) => (
                          <span key={k} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                            {FLOATING_LABELS[k] ?? k} ×{n}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.head ? (
                      <div>
                        <div className="text-slate-700">{r.head.name}</div>
                        <div className="text-xs text-slate-400">{r.head.email ?? r.head.mobile ?? "no contact"}</div>
                      </div>
                    ) : <span className="text-xs text-slate-400">— none —</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {r.floating_total > 0 && r.head && (
                        <button
                          onClick={(e) => { e.stopPropagation(); remind.mutate(r); }}
                          disabled={remind.isPending}
                          className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-50 disabled:opacity-50"
                        >
                          Remind head
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); setReviewId(r.employee_id); }}
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        Review
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      )}

      {reviewId !== null && (
        <TimekeepingReviewDrawer
          employeeId={reviewId}
          from={from || undefined}
          to={to || undefined}
          onClose={() => setReviewId(null)}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "amber" }) {
  const color = tone === "amber" ? "text-amber-700" : "text-slate-900";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
