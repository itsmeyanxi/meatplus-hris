"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { inputCls } from "@/components/employees/ChildList";
import { StatusPill } from "@/components/approvals/StatusPill";
import { listEmployees } from "@/lib/employees";
import {
  correctionsApi,
  type AttendanceCorrection,
  type CorrectionInput,
  type RequestStatus,
} from "@/lib/approvals";
import { useAttendancePerms } from "@/lib/permissions";

const FIELDS = ["actual_in", "actual_out", "hours_worked", "is_absent", "is_rest_day", "remarks"];

export default function CorrectionsPage() {
  const qc = useQueryClient();
  const { canManageAttendance, canApprove } = useAttendancePerms();

  const { data: empPage } = useQuery({
    queryKey: ["employees", { all: true }],
    queryFn: () => listEmployees({ perPage: 100 }),
    enabled: canManageAttendance,
  });

  const [status, setStatus] = useState<RequestStatus | "">("");
  const { data: items = [] } = useQuery({
    queryKey: ["corrections", { status }],
    queryFn: () => correctionsApi.list({ status: status || undefined }),
  });

  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState<CorrectionInput>({
    employee_id: undefined,
    work_date: "",
    field_to_correct: "actual_in",
    old_value: "",
    new_value: "",
    reason: "",
  });

  const create = useMutation({
    mutationFn: () => correctionsApi.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["corrections"] });
      setForm({ employee_id: undefined, work_date: "", field_to_correct: "actual_in", old_value: "", new_value: "", reason: "" });
      setIsAdding(false);
    },
  });
  const approve = useMutation({ mutationFn: (id: number) => correctionsApi.approve(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["corrections"] }) });
  const reject = useMutation({ mutationFn: (id: number) => correctionsApi.reject(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["corrections"] }) });
  const cancel = useMutation({ mutationFn: (id: number) => correctionsApi.cancel(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["corrections"] }) });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Attendance corrections</h2>
          <p className="text-sm text-slate-500">
            {items.length} shown{!canManageAttendance && " — your own only"} — approved corrections auto-apply to DTR in Phase 2.1b.
          </p>
        </div>
        <button onClick={() => setIsAdding((v) => !v)} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
          {isAdding ? "Cancel" : "+ File correction"}
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
          <input type="date" className={inputCls} value={form.work_date} onChange={(e) => setForm({ ...form, work_date: e.target.value })} required />
          <select className={inputCls} value={form.field_to_correct} onChange={(e) => setForm({ ...form, field_to_correct: e.target.value })}>
            {FIELDS.map((f) => (<option key={f} value={f}>{f}</option>))}
          </select>
          <input className={inputCls} placeholder="Old value" value={form.old_value ?? ""} onChange={(e) => setForm({ ...form, old_value: e.target.value })} />
          <input className={`${inputCls} sm:col-span-2`} placeholder="New value *" value={form.new_value} onChange={(e) => setForm({ ...form, new_value: e.target.value })} required />
          <textarea className={`${inputCls} sm:col-span-3`} placeholder="Reason *" rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required />
          <div className="sm:col-span-3 flex justify-end">
            <button type="submit" disabled={create.isPending} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
              {create.isPending ? "Saving…" : "File correction"}
            </button>
          </div>
        </form>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold">Filter</h3>
        <div className="flex gap-2 flex-wrap">
          {(["", "pending", "approved", "rejected", "cancelled"] as const).map((s) => (
            <button key={s || "all"} onClick={() => setStatus(s)} className={status === s ? "rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white capitalize" : "rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 capitalize"}>
              {s || "All"}
            </button>
          ))}
        </div>
      </section>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2">Status</th>
              {canManageAttendance && <th className="px-3 py-2">Employee</th>}
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Field</th>
              <th className="px-3 py-2">Old → New</th>
              <th className="px-3 py-2">Reason</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length === 0 && (<tr><td colSpan={canManageAttendance ? 7 : 6} className="px-3 py-6 text-center text-slate-500">No requests match.</td></tr>)}
            {items.map((r: AttendanceCorrection) => (
              <tr key={r.id}>
                <td className="px-3 py-2"><StatusPill status={r.status} /></td>
                {canManageAttendance && (
                  <td className="px-3 py-2">
                    <div className="text-xs font-mono text-slate-500">{r.employee?.employee_no}</div>
                    <div>{r.employee?.full_name}</div>
                  </td>
                )}
                <td className="px-3 py-2 font-mono">{r.work_date}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.field_to_correct}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  <span className="text-slate-500">{r.old_value ?? "—"}</span>{" → "}<span className="font-medium">{r.new_value}</span>
                </td>
                <td className="px-3 py-2 max-w-xs">{r.reason}</td>
                <td className="px-3 py-2 text-right">
                  {r.status === "pending" && (
                    <div className="flex justify-end gap-1">
                      {canApprove && (
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
