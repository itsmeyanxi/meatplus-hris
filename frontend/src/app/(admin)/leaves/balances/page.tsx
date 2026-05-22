"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { inputCls } from "@/components/employees/ChildList";
import { listEmployees } from "@/lib/employees";
import { useAttendancePerms } from "@/lib/permissions";
import { leaveBalancesApi } from "@/lib/leaves";

export default function LeaveBalancesPage() {
  const { canManageAttendance } = useAttendancePerms();
  const [year, setYear] = useState(new Date().getFullYear());
  const [employeeId, setEmployeeId] = useState<number | "">("");

  const { data: empPage } = useQuery({
    queryKey: ["employees", { all: true }],
    queryFn: () => listEmployees({ perPage: 100 }),
    enabled: canManageAttendance,
  });

  const { data: balances = [] } = useQuery({
    queryKey: ["leave-balances", { year, employeeId }],
    queryFn: () => leaveBalancesApi.list({ year, employee_id: employeeId === "" ? undefined : Number(employeeId) }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Leave balances</h2>
        <p className="text-sm text-slate-500">{!canManageAttendance && "Your balances for the selected year."}</p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {canManageAttendance && (
          <select className={inputCls} value={employeeId} onChange={(e) => setEmployeeId(e.target.value === "" ? "" : Number(e.target.value))}>
            <option value="">All employees</option>
            {empPage?.data.map((e) => (<option key={e.id} value={e.id}>{e.employee_no} — {e.full_name}</option>))}
          </select>
        )}
        <input type="number" className={inputCls} value={year} onChange={(e) => setYear(Number(e.target.value))} min={2020} max={2100} />
      </section>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              {canManageAttendance && <th className="px-3 py-2">Employee</th>}
              <th className="px-3 py-2">Leave type</th>
              <th className="px-3 py-2">Opening</th>
              <th className="px-3 py-2">Accrued</th>
              <th className="px-3 py-2">Used</th>
              <th className="px-3 py-2">Current</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {balances.length === 0 && (<tr><td colSpan={canManageAttendance ? 6 : 5} className="px-3 py-6 text-center text-slate-500">No balances. Pick an employee or file a leave to materialize rows.</td></tr>)}
            {balances.map((b) => (
              <tr key={b.id}>
                {canManageAttendance && (
                  <td className="px-3 py-2">
                    <div className="text-xs font-mono text-slate-500">{b.employee?.employee_no}</div>
                    <div>{b.employee?.full_name}</div>
                  </td>
                )}
                <td className="px-3 py-2"><span className="font-mono text-xs">{b.leave_type.code}</span> — {b.leave_type.name}</td>
                <td className="px-3 py-2 font-mono text-xs">{b.opening_balance}</td>
                <td className="px-3 py-2 font-mono text-xs">{b.accrued}</td>
                <td className="px-3 py-2 font-mono text-xs">{b.used}</td>
                <td className="px-3 py-2 font-mono font-semibold">{b.current_balance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
