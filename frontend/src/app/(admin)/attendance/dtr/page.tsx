"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getMe } from "@/lib/auth";
import { listEmployees } from "@/lib/employees";
import { dtrApi, type DailyTimeRecord } from "@/lib/attendance";
import { AppButton, AppCard, PageHeader, TableShell } from "@/components/ui";

import { inputCls, labelCls } from "@/lib/form-classes";

export default function DtrPage() {
  const qc = useQueryClient();

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  // Only HR (attendance.view.any) may browse other employees; everyone else is self-only.
  const canViewAny = me?.user.permissions.includes("attendance.view.any") ?? false;
  // Recomputing DTRs is restricted to attendance.manage holders.
  const canManage = me?.user.permissions.includes("attendance.manage") ?? false;

  const { data: empPage } = useQuery({
    queryKey: ["employees", { all: true }],
    queryFn: () => listEmployees({ perPage: 100 }),
    enabled: canViewAny,
  });

  const [employeeId, setEmployeeId] = useState<number | "">("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const key = ["dtr", { employeeId, from, to }];
  const { data: items = [] } = useQuery({
    queryKey: key,
    queryFn: () =>
      dtrApi.list({
        employee_id: employeeId === "" ? undefined : Number(employeeId),
        from: from || undefined,
        to: to || undefined,
      }),
  });

  const compute = useMutation({
    mutationFn: () => dtrApi.compute({ employee_id: Number(employeeId), from, to }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const canCompute = employeeId !== "" && from && to;

  const summary = useMemo(() => {
    let present = 0, late = 0, absent = 0, otMinutes = 0;
    for (const d of items) {
      otMinutes += d.overtime_minutes || 0;
      if (d.is_absent) absent++;
      else if (d.late_minutes > 0) late++;
      else if (Number(d.hours_worked) > 0) present++;
    }
    return { present, late, absent, otHours: otMinutes / 60 };
  }, [items]);

  const statCards = [
    { label: "Present", value: String(summary.present), dot: "bg-emerald-500" },
    { label: "Late", value: String(summary.late), dot: "bg-amber-500" },
    { label: "Absent", value: String(summary.absent), dot: "bg-red-500" },
    { label: "Overtime", value: `${summary.otHours.toFixed(1)}h`, dot: "bg-indigo-500" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Daily time records (DTR)"
        description="Computed daily summaries. Press Compute to (re)build records from time logs + schedule + holidays for the selected employee and range."
      />

      <AppCard>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {canViewAny && (
            <div>
              <label className={labelCls}>Employee</label>
              <select className={inputCls} value={employeeId} onChange={(e) => setEmployeeId(e.target.value === "" ? "" : Number(e.target.value))}>
                <option value="">All employees</option>
                {empPage?.data.map((e) => (<option key={e.id} value={e.id}>{e.employee_no} — {e.full_name}</option>))}
              </select>
            </div>
          )}
          <div>
            <label className={labelCls}>From</label>
            <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>To</label>
            <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          {canManage && (
            <div className="flex items-end">
              <AppButton
                className="w-full"
                disabled={!canCompute || compute.isPending}
                onClick={() => compute.mutate()}
                title={canCompute ? "" : "Pick employee + from + to first"}
              >
                {compute.isPending ? "Computing…" : "Compute"}
              </AppButton>
            </div>
          )}
        </div>
      </AppCard>

      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {statCards.map((card) => (
            <div
              key={card.label}
              className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur"
            >
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${card.dot}`} />
                <p className="text-xs font-medium text-slate-500">{card.label}</p>
              </div>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{card.value}</p>
            </div>
          ))}
        </div>
      )}

      <TableShell>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
              {["Date", "Emp #", "In", "Out", "Hours", "Late", "Under", "OT", "Flags"].map((h) => (
                <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-16 text-center">
                  <p className="text-sm font-medium text-slate-700">No DTR records</p>
                  <p className="mt-1 text-sm text-slate-500">Pick an employee + range and press Compute.</p>
                </td>
              </tr>
            )}
            {items.map((d: DailyTimeRecord) => (
              <tr
                key={d.id}
                className={
                  "border-t border-slate-100 transition " +
                  (d.is_absent ? "bg-red-50/60" : d.is_rest_day ? "bg-slate-50" : d.holiday_type ? "bg-amber-50/60" : "hover:bg-slate-50/70")
                }
              >
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{d.work_date}</td>
                <td className="px-4 py-3 text-slate-600">{d.employee_id}</td>
                <td className="px-4 py-3 text-slate-600">{d.actual_in ? d.actual_in.slice(11, 16) : "—"}</td>
                <td className="px-4 py-3 text-slate-600">{d.actual_out ? d.actual_out.slice(11, 16) : "—"}</td>
                <td className="px-4 py-3 font-medium text-slate-800">{d.hours_worked}</td>
                <td className="px-4 py-3 text-slate-600">{d.late_minutes ? `${d.late_minutes}m` : "—"}</td>
                <td className="px-4 py-3 text-slate-600">{d.undertime_minutes ? `${d.undertime_minutes}m` : "—"}</td>
                <td className="px-4 py-3 text-slate-600">{d.overtime_minutes ? `${d.overtime_minutes}m` : "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {d.is_absent && <Pill color="red">Absent</Pill>}
                    {d.is_rest_day && <Pill color="slate">Rest day</Pill>}
                    {d.holiday_type && <Pill color="amber">{d.holiday_type}</Pill>}
                    {d.is_on_leave && <Pill color="blue">Leave</Pill>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}

function Pill({ color, children }: { color: "red" | "slate" | "amber" | "blue"; children: React.ReactNode }) {
  const cls: Record<string, string> = {
    red: "bg-red-100 text-red-800",
    slate: "bg-slate-200 text-slate-800",
    amber: "bg-amber-100 text-amber-800",
    blue: "bg-blue-100 text-blue-800",
  };
  return <span className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${cls[color]}`}>{children}</span>;
}
