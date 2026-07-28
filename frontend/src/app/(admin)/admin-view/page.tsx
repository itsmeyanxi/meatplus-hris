"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { PageHeader, TableShell } from "@/components/ui";
import { adminApi, type AdminCompany } from "@/lib/admin";
import { peso } from "@/lib/payroll";

const RUN_STYLE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  computed: "bg-sky-50 text-sky-700",
  approved: "bg-amber-50 text-amber-700",
  posted: "bg-emerald-50 text-emerald-700",
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "2-digit", hour: "numeric", minute: "2-digit", hour12: true });
}

export default function AdminViewPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["admin-overview"], queryFn: adminApi.overview, refetchInterval: 60_000 });

  if (isError) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Admin view</h2>
        <p className="mt-1 text-sm text-slate-500">This view is for super-admins only.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin View — All Companies"
        description="Cross-company overview for super-admins. Everything below spans every company at once, regardless of which one you're switched into."
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Companies" value={data?.totals.companies} />
        <Kpi label="Employees" value={data?.totals.employees} />
        <Kpi label="With login" value={data?.totals.with_login} sub={data ? `${Math.round((data.totals.with_login / Math.max(1, data.totals.employees)) * 100)}% of staff` : ""} />
        <Kpi label="Pending approvals" value={data?.totals.pending_approvals} tone={data && data.totals.pending_approvals > 0 ? "amber" : "slate"} />
      </div>

      {/* System health strip */}
      {data && (
        <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-xs">
          <Health label="Biometrics" value={`latest ${fmtDateTime(data.system.latest_punch)}`} ok={data.system.punches_24h > 0} extra={`${data.system.punches_24h} in 24h`} />
          <Health label="Mail queue" value={`${data.system.mail_pending} pending`} ok={data.system.mail_failed === 0} extra={data.system.mail_failed > 0 ? `${data.system.mail_failed} failed` : "0 failed"} />
          <Health label="Logins (24h)" value={`${data.system.logins_24h}`} ok extra={`${data.system.active_users} active users`} />
          <span className="ml-auto self-center text-slate-400">Server time {data.system.server_time}</span>
        </div>
      )}

      {/* Per-company table */}
      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">By company</h2>
        <TableShell>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3 text-right">Employees</th>
                  <th className="px-4 py-3 text-right">Accounts</th>
                  <th className="px-4 py-3 text-right">Punches today</th>
                  <th className="px-4 py-3 text-right">Pending</th>
                  <th className="px-4 py-3">Latest payroll</th>
                  <th className="px-4 py-3">Data gaps</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Loading…</td></tr>}
                {data?.companies.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 font-medium text-slate-800">
                        {c.code}
                        {c.is_demo && <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-600">DEMO</span>}
                      </div>
                      <div className="text-xs text-slate-400">{c.name}</div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.employees}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500">{c.with_login}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500">{c.punches_today}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {c.pending_approvals > 0 ? <span className="font-semibold text-amber-700">{c.pending_approvals}</span> : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {c.latest_run ? (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${RUN_STYLE[c.latest_run.status] ?? "bg-slate-100 text-slate-600"}`} title={c.latest_run.period}>
                          {c.latest_run.status}
                        </span>
                      ) : <span className="text-xs text-slate-300">no run</span>}
                    </td>
                    <td className="px-4 py-3"><Gaps c={c} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TableShell>
      </section>

      {/* Recent payroll runs */}
      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Recent payroll runs</h2>
        <TableShell>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Run</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Payslips</th>
                  <th className="px-4 py-3 text-right">Gross</th>
                  <th className="px-4 py-3 text-right">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.recent_runs.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No payroll runs yet.</td></tr>}
                {data?.recent_runs.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-medium text-slate-700">{r.company ?? "—"}</td>
                    <td className="px-4 py-3"><div className="text-slate-700">{r.name}</div><div className="text-xs text-slate-400">{r.period}</div></td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${RUN_STYLE[r.status] ?? "bg-slate-100 text-slate-600"}`}>{r.status}</span></td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500">{r.payslips}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{peso(r.gross)}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">{peso(r.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TableShell>
      </section>
    </div>
  );
}

function Gaps({ c }: { c: AdminCompany }) {
  const g = c.gaps;
  const chips: [string, number][] = [
    ["salary", g.no_salary], ["bank", g.no_bank], ["gov ID", g.no_gov], ["position", g.no_position], ["schedule", g.no_schedule],
  ];
  const any = chips.some(([, n]) => n > 0);
  if (!any) return <span className="text-xs font-medium text-emerald-600">✓ complete</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {chips.filter(([, n]) => n > 0).map(([label, n]) => (
        <span key={label} className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">{n} {label}</span>
      ))}
    </div>
  );
}

function Kpi({ label, value, sub, tone = "slate" }: { label: string; value?: number; sub?: string; tone?: "slate" | "amber" }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${tone === "amber" ? "text-amber-700" : "text-slate-900"}`}>{value ?? "—"}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function Health({ label, value, ok, extra }: { label: string; value: string; ok: boolean; extra?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-1.5">
      <span className={`h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : "bg-rose-500"}`} />
      <span className="font-semibold text-slate-700">{label}</span>
      <span className="text-slate-500">{value}</span>
      {extra && <span className="text-slate-400">· {extra}</span>}
    </div>
  );
}
