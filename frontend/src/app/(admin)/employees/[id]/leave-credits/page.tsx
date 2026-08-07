"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { leaveBalancesApi, type LeaveBalance } from "@/lib/leaves";
import { AppCard, TableShell } from "@/components/ui";

export default function LeaveCreditsTab() {
  const params = useParams();
  const employeeId = Number(params.id);
  const year = new Date().getFullYear();

  const { data, isLoading } = useQuery({
    queryKey: ["employee-leave-credits", employeeId, year],
    queryFn: () => leaveBalancesApi.list({ employee_id: employeeId, year }),
    enabled: Number.isFinite(employeeId),
  });

  // Only show leave types that actually carry credits (skip 0-entitlement rows).
  const rows = (data ?? [])
    .map((b: LeaveBalance) => {
      const remaining = Number(b.current_balance);
      const used = Number(b.used);
      const entitlement = remaining + used; // opening + accrued + granted
      return { ...b, remaining, used, entitlement };
    })
    .filter((b) => b.entitlement > 0 || b.used > 0)
    .sort((a, b) => a.leave_type.name.localeCompare(b.leave_type.name));

  const totalRemaining = rows.reduce((s, b) => s + b.remaining, 0);
  const totalEntitlement = rows.reduce((s, b) => s + b.entitlement, 0);
  const totalUsed = rows.reduce((s, b) => s + b.used, 0);

  return (
    <AppCard
      title={`Leave credits — ${year}`}
      description="The employee's current leave balances. Entitlement is the year's grant; remaining is what they can still file."
    >
      {isLoading ? (
        <p className="py-6 text-center text-sm text-slate-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">
          No leave credits on file for {year}.
        </p>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-3">
            <Stat label="Entitlement" value={totalEntitlement} tone="slate" />
            <Stat label="Used" value={totalUsed} tone="amber" />
            <Stat label="Remaining" value={totalRemaining} tone="emerald" />
          </div>
          <TableShell>
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Leave type</th>
                  <th className="px-4 py-3 text-right">Entitlement</th>
                  <th className="px-4 py-3 text-right">Used</th>
                  <th className="px-4 py-3 text-right">Remaining</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-900">
                      {b.leave_type.name}
                      <span className="ml-2 font-mono text-[11px] text-slate-400">{b.leave_type.code}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{b.entitlement}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-amber-700">{b.used || "—"}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-emerald-700">{b.remaining}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
          <p className="mt-3 text-xs text-slate-400">
            Credits are granted per year. Adjust or grant credits from Leaves &rarr; Balances.
          </p>
        </>
      )}
    </AppCard>
  );
}

const TONES = {
  slate: "bg-slate-50 border-slate-200 text-slate-900",
  amber: "bg-amber-50 border-amber-200 text-amber-800",
  emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
} as const;

function Stat({ label, value, tone }: { label: string; value: number; tone: keyof typeof TONES }) {
  return (
    <div className={`flex flex-col rounded-xl border p-4 ${TONES[tone]}`}>
      <span className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</span>
      <span className="mt-1 text-2xl font-bold tabular-nums">{value}</span>
      <span className="text-[11px] opacity-60">days</span>
    </div>
  );
}
