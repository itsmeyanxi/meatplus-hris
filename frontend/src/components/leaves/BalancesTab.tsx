"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { TableShell } from "@/components/ui";
import { listEmployees } from "@/lib/employees";
import { useAttendancePerms } from "@/lib/permissions";
import { leaveBalancesApi } from "@/lib/leaves";

const inputCls =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-900/50";
const labelCls = "mb-1.5 block text-sm font-medium text-slate-700";

export function BalancesTab() {
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

  const colSpan = canManageAttendance ? 6 : 5;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {canManageAttendance && (
          <div>
            <label className={labelCls}>Employee</label>
            <select className={inputCls} value={employeeId} onChange={(e) => setEmployeeId(e.target.value === "" ? "" : Number(e.target.value))}>
              <option value="">All employees</option>
              {empPage?.data.map((e) => (<option key={e.id} value={e.id}>{e.employee_no} — {e.full_name}</option>))}
            </select>
          </div>
        )}
        <div>
          <label className={labelCls}>Year</label>
          <input type="number" className={inputCls} value={year} onChange={(e) => setYear(Number(e.target.value))} min={2020} max={2100} />
        </div>
      </div>

      <TableShell>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
              {canManageAttendance && <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Employee</th>}
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Leave type</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Opening</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Accrued</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Used</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Current</th>
            </tr>
          </thead>
          <tbody>
            {balances.length === 0 && (
              <tr>
                <td colSpan={colSpan} className="px-4 py-16 text-center">
                  <p className="text-sm font-medium text-slate-700">No balances yet</p>
                  <p className="mt-1 text-sm text-slate-500">Pick an employee or file a leave to materialize rows.</p>
                </td>
              </tr>
            )}
            {balances.map((b) => (
              <tr key={b.id} className="border-t border-slate-100 transition hover:bg-slate-50/70">
                {canManageAttendance && (
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{b.employee?.full_name}</div>
                    <div className="font-mono text-xs text-slate-400">{b.employee?.employee_no}</div>
                  </td>
                )}
                <td className="px-4 py-3"><span className="font-mono text-xs text-slate-600">{b.leave_type.code}</span> — {b.leave_type.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{b.opening_balance}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{b.accrued}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{b.used}</td>
                <td className="px-4 py-3 font-mono font-semibold text-slate-900">{b.current_balance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}
