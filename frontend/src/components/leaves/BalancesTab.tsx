"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { TableShell } from "@/components/ui";
import { listEmployees } from "@/lib/employees";
import { useAttendancePerms } from "@/lib/permissions";
import { leaveBalancesApi } from "@/lib/leaves";
import { inputCls, labelCls } from "@/lib/form-classes";

export function BalancesTab() {
  const qc = useQueryClient();
  const { canManageAttendance } = useAttendancePerms();
  const [year, setYear] = useState(new Date().getFullYear());
  const [employeeId, setEmployeeId] = useState<number | "">("");

  // Inline-adjust state
  const [adjustingId, setAdjustingId] = useState<number | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustError, setAdjustError] = useState<string | null>(null);

  const { data: empPage } = useQuery({
    queryKey: ["employees", { all: true }],
    queryFn: () => listEmployees({ perPage: 100 }),
    enabled: canManageAttendance,
  });

  const { data: balances = [] } = useQuery({
    queryKey: ["leave-balances", { year, employeeId }],
    queryFn: () => leaveBalancesApi.list({ year, employee_id: employeeId === "" ? undefined : Number(employeeId) }),
  });

  const adjustMutation = useMutation({
    mutationFn: ({ id, adjustment, note }: { id: number; adjustment: number; note: string }) =>
      leaveBalancesApi.adjust(id, adjustment, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-balances"] });
      setAdjustingId(null);
      setAdjustAmount("");
      setAdjustNote("");
      setAdjustError(null);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setAdjustError(msg ?? "Adjustment failed. Please try again.");
    },
  });

  function openAdjust(id: number) {
    setAdjustingId(id);
    setAdjustAmount("");
    setAdjustNote("");
    setAdjustError(null);
  }

  function cancelAdjust() {
    setAdjustingId(null);
    setAdjustAmount("");
    setAdjustNote("");
    setAdjustError(null);
  }

  function submitAdjust(id: number) {
    const amount = parseFloat(adjustAmount);
    if (isNaN(amount)) { setAdjustError("Enter a valid number."); return; }
    if (!adjustNote.trim()) { setAdjustError("A note is required."); return; }
    adjustMutation.mutate({ id, adjustment: amount, note: adjustNote.trim() });
  }

  // HR sees: employee + leave type + opening + accrued + used + current + actions = 7
  // Others:                 leave type + opening + accrued + used + current         = 5
  const colSpan = canManageAttendance ? 7 : 5;

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
          <select className={inputCls} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
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
              {canManageAttendance && <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Actions</th>}
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
              <React.Fragment key={b.id}>
                <tr className="border-t border-slate-100 transition hover:bg-slate-50/70">
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
                  {canManageAttendance && (
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => adjustingId === b.id ? cancelAdjust() : openAdjust(b.id)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:border-slate-300"
                      >
                        {adjustingId === b.id ? "Cancel" : "Adjust"}
                      </button>
                    </td>
                  )}
                </tr>

                {canManageAttendance && adjustingId === b.id && (
                  <tr key={`${b.id}-adjust`} className="border-t border-slate-100 bg-slate-50/60">
                    <td colSpan={colSpan} className="px-4 py-4">
                      <div className="flex flex-wrap items-end gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-600">
                            Adjustment <span className="font-normal text-slate-400">(+ add, − deduct)</span>
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="e.g. 1.5 or -0.5"
                            value={adjustAmount}
                            onChange={(e) => setAdjustAmount(e.target.value)}
                            className="w-36 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
                          />
                        </div>
                        <div className="flex-1 min-w-48">
                          <label className="mb-1 block text-xs font-medium text-slate-600">Note <span className="text-red-500">*</span></label>
                          <input
                            type="text"
                            placeholder="Reason for adjustment"
                            value={adjustNote}
                            onChange={(e) => setAdjustNote(e.target.value)}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => submitAdjust(b.id)}
                            disabled={adjustMutation.isPending}
                            className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                          >
                            {adjustMutation.isPending ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelAdjust}
                            className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                      {adjustError && (
                        <p className="mt-2 text-xs text-red-600">{adjustError}</p>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}
