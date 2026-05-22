"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listEmployees } from "@/lib/employees";
import { dtrApi, type DailyTimeRecord } from "@/lib/attendance";
import { inputCls } from "@/components/employees/ChildList";

export default function DtrPage() {
  const qc = useQueryClient();

  const { data: empPage } = useQuery({
    queryKey: ["employees", { all: true }],
    queryFn: () => listEmployees({ perPage: 100 }),
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
    mutationFn: () =>
      dtrApi.compute({
        employee_id: Number(employeeId),
        from,
        to,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const canCompute = employeeId !== "" && from && to;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Daily time records (DTR)</h2>
        <p className="text-sm text-slate-500">
          Computed daily summaries. Press <strong>Compute</strong> to (re)build records from time logs + schedule + holidays for the selected employee and range.
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <select
            className={inputCls}
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <option value="">All employees</option>
            {empPage?.data.map((e) => (
              <option key={e.id} value={e.id}>
                {e.employee_no} — {e.full_name}
              </option>
            ))}
          </select>
          <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
          <button
            disabled={!canCompute || compute.isPending}
            onClick={() => compute.mutate()}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            title={canCompute ? "" : "Pick employee + from + to first"}
          >
            {compute.isPending ? "Computing…" : "Compute"}
          </button>
        </div>
      </section>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Emp #</th>
              <th className="px-3 py-2">In</th>
              <th className="px-3 py-2">Out</th>
              <th className="px-3 py-2">Hours</th>
              <th className="px-3 py-2">Late</th>
              <th className="px-3 py-2">Under</th>
              <th className="px-3 py-2">OT</th>
              <th className="px-3 py-2">Flags</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                  No DTR records. Pick an employee + range and press Compute.
                </td>
              </tr>
            )}
            {items.map((d: DailyTimeRecord) => (
              <tr
                key={d.id}
                className={d.is_absent ? "bg-red-50" : d.is_rest_day ? "bg-slate-50" : d.holiday_type ? "bg-amber-50" : "hover:bg-slate-50"}
              >
                <td className="px-3 py-2 font-mono">{d.work_date}</td>
                <td className="px-3 py-2">{d.employee_id}</td>
                <td className="px-3 py-2">{d.actual_in ? d.actual_in.slice(11, 16) : "—"}</td>
                <td className="px-3 py-2">{d.actual_out ? d.actual_out.slice(11, 16) : "—"}</td>
                <td className="px-3 py-2 font-medium">{d.hours_worked}</td>
                <td className="px-3 py-2">{d.late_minutes ? `${d.late_minutes}m` : "—"}</td>
                <td className="px-3 py-2">{d.undertime_minutes ? `${d.undertime_minutes}m` : "—"}</td>
                <td className="px-3 py-2">{d.overtime_minutes ? `${d.overtime_minutes}m` : "—"}</td>
                <td className="px-3 py-2">
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
      </div>
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
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${cls[color]}`}>
      {children}
    </span>
  );
}
