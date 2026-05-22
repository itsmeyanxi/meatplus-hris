"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { inputCls } from "@/components/employees/ChildList";
import { StatusPill } from "@/components/approvals/StatusPill";
import { listEmployees } from "@/lib/employees";
import { useAttendancePerms } from "@/lib/permissions";
import { leaveAppsApi, leaveTypesApi, type LeaveAppInput, type LeaveStatus } from "@/lib/leaves";

export default function LeaveApplicationsPage() {
  const qc = useQueryClient();
  const { canManageAttendance, canApprove } = useAttendancePerms();

  const { data: types = [] } = useQuery({ queryKey: ["leave-types"], queryFn: leaveTypesApi.list });
  const { data: empPage } = useQuery({
    queryKey: ["employees", { all: true }],
    queryFn: () => listEmployees({ perPage: 100 }),
    enabled: canManageAttendance,
  });

  const [status, setStatus] = useState<LeaveStatus | "">("");
  const { data: items = [] } = useQuery({
    queryKey: ["leave-apps", { status }],
    queryFn: () => leaveAppsApi.list({ status: status || undefined }),
  });

  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState<LeaveAppInput>({
    employee_id: undefined,
    leave_type_id: 0,
    date_from: "",
    date_to: "",
    reason: "",
  });
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => leaveAppsApi.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-apps"] });
      qc.invalidateQueries({ queryKey: ["leave-balances"] });
      setForm({ employee_id: undefined, leave_type_id: 0, date_from: "", date_to: "", reason: "" });
      setIsAdding(false);
      setError(null);
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { errors?: Record<string, string[]>; message?: string } } };
      const msgs = err?.response?.data?.errors;
      setError(msgs ? Object.values(msgs).flat().join(" ") : err?.response?.data?.message ?? "Failed");
    },
  });
  const approve = useMutation({
    mutationFn: (id: number) => leaveAppsApi.approve(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-apps"] }); qc.invalidateQueries({ queryKey: ["leave-balances"] }); },
  });
  const reject = useMutation({
    mutationFn: (id: number) => leaveAppsApi.reject(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leave-apps"] }),
  });
  const cancel = useMutation({
    mutationFn: (id: number) => leaveAppsApi.cancel(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-apps"] }); qc.invalidateQueries({ queryKey: ["leave-balances"] }); },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Leave applications</h2>
          <p className="text-sm text-slate-500">{items.length} shown{!canManageAttendance && " — your own only"}</p>
        </div>
        <button onClick={() => setIsAdding((v) => !v)} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
          {isAdding ? "Cancel" : "+ File leave"}
        </button>
      </div>

      {isAdding && (
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="rounded-xl border border-slate-200 bg-white p-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {canManageAttendance && (
            <select className={inputCls} value={form.employee_id ?? ""} onChange={(e) => setForm({ ...form, employee_id: e.target.value ? Number(e.target.value) : undefined })} required>
              <option value="">Employee *</option>
              {empPage?.data.map((e) => (<option key={e.id} value={e.id}>{e.employee_no} — {e.full_name}</option>))}
            </select>
          )}
          <select className={inputCls} value={form.leave_type_id || ""} onChange={(e) => setForm({ ...form, leave_type_id: Number(e.target.value) })} required>
            <option value="">Leave type *</option>
            {types.map((t) => (<option key={t.id} value={t.id}>{t.code} — {t.name}</option>))}
          </select>
          <input type="date" className={inputCls} value={form.date_from} onChange={(e) => setForm({ ...form, date_from: e.target.value })} required />
          <input type="date" className={inputCls} value={form.date_to} onChange={(e) => setForm({ ...form, date_to: e.target.value })} required />
          <textarea className={`${inputCls} sm:col-span-3`} placeholder="Reason *" rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required />
          {error && <p className="sm:col-span-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
          <div className="sm:col-span-3 flex justify-end">
            <button type="submit" disabled={create.isPending} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
              {create.isPending ? "Saving…" : "File request"}
            </button>
          </div>
        </form>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold">Filter</h3>
        <div className="flex gap-2 flex-wrap">
          {(["", "pending", "approved", "rejected", "cancelled"] as const).map((s) => (
            <button key={s || "all"} onClick={() => setStatus(s)} className={status === s ? "rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white capitalize" : "rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 capitalize"}>{s || "All"}</button>
          ))}
        </div>
      </section>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2">Status</th>
              {canManageAttendance && <th className="px-3 py-2">Employee</th>}
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Dates</th>
              <th className="px-3 py-2">Days</th>
              <th className="px-3 py-2">Reason</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length === 0 && (<tr><td colSpan={canManageAttendance ? 7 : 6} className="px-3 py-6 text-center text-slate-500">No leaves match.</td></tr>)}
            {items.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2"><StatusPill status={r.status} /></td>
                {canManageAttendance && (
                  <td className="px-3 py-2">
                    <div className="text-xs font-mono text-slate-500">{r.employee?.employee_no}</div>
                    <div>{r.employee?.full_name}</div>
                  </td>
                )}
                <td className="px-3 py-2 font-mono text-xs">{r.leave_type.code}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.date_from} → {r.date_to}</td>
                <td className="px-3 py-2 font-medium">{r.days_count}</td>
                <td className="px-3 py-2 max-w-xs">{r.reason}</td>
                <td className="px-3 py-2 text-right">
                  {(r.status === "pending" || r.status === "approved") && (
                    <div className="flex justify-end gap-1">
                      {r.status === "pending" && canApprove && (
                        <>
                          <button onClick={() => approve.mutate(r.id)} className="rounded-md bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700">Approve</button>
                          <button onClick={() => reject.mutate(r.id)} className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700">Reject</button>
                        </>
                      )}
                      <button onClick={() => cancel.mutate(r.id)} className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-100">Cancel</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
