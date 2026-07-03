"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { StatusPill } from "@/components/approvals/StatusPill";
import { AppButton, AppCard, TableShell } from "@/components/ui";
import { getMe } from "@/lib/auth";
import { listEmployees } from "@/lib/employees";
import { leaveAppsApi, leaveTypesApi, type LeaveAppInput, type LeaveStatus } from "@/lib/leaves";
import { inputCls, labelCls } from "@/lib/form-classes";

const FILTERS: Array<{ value: LeaveStatus | ""; label: string }> = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

export function ApplicationsTab() {
  const qc = useQueryClient();
  // Only dept_head (leave.approve.any) sees all leaves, files for others, and approves.
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const canManage = me?.user.permissions.includes("leave.approve.any") ?? false;
  const canApprove = canManage;
  const showFile = Boolean(me?.user.employee) || canManage;

  const { data: types = [] } = useQuery({ queryKey: ["leave-types"], queryFn: leaveTypesApi.list });
  const { data: empPage } = useQuery({
    queryKey: ["employees", { all: true }],
    queryFn: () => listEmployees({ perPage: 100 }),
    enabled: canManage,
  });

  const [status, setStatus] = useState<LeaveStatus | "">("");
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectRemarks, setRejectRemarks] = useState("");
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
    mutationFn: ({ id, remarks }: { id: number; remarks: string }) =>
      leaveAppsApi.reject(id, remarks || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-apps"] });
      setRejectingId(null);
      setRejectRemarks("");
    },
  });
  const cancel = useMutation({
    mutationFn: (id: number) => leaveAppsApi.cancel(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-apps"] }); qc.invalidateQueries({ queryKey: ["leave-balances"] }); },
  });

  const colSpan = canManage ? 7 : 6;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {items.length} shown{!canManage ? " — your own only" : ""}
        </p>
        {showFile && (
          <AppButton variant={isAdding ? "secondary" : "primary"} onClick={() => setIsAdding((v) => !v)}>
            {isAdding ? "Cancel" : "+ File leave"}
          </AppButton>
        )}
      </div>

      {isAdding && (
        <AppCard title="File a leave request">
          <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {canManage && (
              <div>
                <label className={labelCls}>Employee *</label>
                <select className={inputCls} value={form.employee_id ?? ""} onChange={(e) => setForm({ ...form, employee_id: e.target.value ? Number(e.target.value) : undefined })} required>
                  <option value="">Select employee…</option>
                  {empPage?.data.map((e) => (<option key={e.id} value={e.id}>{e.employee_no} — {e.full_name}</option>))}
                </select>
              </div>
            )}
            <div>
              <label className={labelCls}>Leave type *</label>
              <select className={inputCls} value={form.leave_type_id || ""} onChange={(e) => setForm({ ...form, leave_type_id: Number(e.target.value) })} required>
                <option value="">Select type…</option>
                {types.map((t) => (<option key={t.id} value={t.id}>{t.code} — {t.name}</option>))}
              </select>
            </div>
            <div>
              <label className={labelCls}>From *</label>
              <input type="date" className={inputCls} value={form.date_from} onChange={(e) => setForm({ ...form, date_from: e.target.value })} required />
            </div>
            <div>
              <label className={labelCls}>To *</label>
              <input type="date" className={inputCls} value={form.date_to} onChange={(e) => setForm({ ...form, date_to: e.target.value })} required />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Reason *</label>
              <textarea className={`${inputCls} resize-y`} placeholder="Reason for the leave…" rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required />
            </div>
            {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{error}</p>}
            <div className="flex justify-end sm:col-span-2">
              <AppButton type="submit" disabled={create.isPending}>{create.isPending ? "Saving…" : "File request"}</AppButton>
            </div>
          </form>
        </AppCard>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value || "all"}
            onClick={() => setStatus(f.value)}
            className={
              status === f.value
                ? "rounded-full bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm"
                : "rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      <TableShell>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Status</th>
              {canManage && <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Employee</th>}
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Type</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Dates</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Days</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Reason</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={colSpan} className="px-4 py-16 text-center">
                  <p className="text-sm font-medium text-slate-700">No leave applications</p>
                  <p className="mt-1 text-sm text-slate-500">Nothing matches this filter yet.</p>
                </td>
              </tr>
            )}
            {items.map((r) => (
              <>
                <tr key={r.id} className="border-t border-slate-100 transition hover:bg-slate-50/70">
                  <td className="px-4 py-3"><StatusPill status={r.status} /></td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{r.employee?.full_name}</div>
                      <div className="font-mono text-xs text-slate-400">{r.employee?.employee_no}</div>
                    </td>
                  )}
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.leave_type.code}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.date_from} → {r.date_to}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{r.days_count}</td>
                  <td className="max-w-xs px-4 py-3 text-slate-600">{r.reason}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Link href={`/leaves/${r.id}`} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50">View</Link>
                      {r.status === "pending" && canApprove && (
                        <>
                          <button
                            onClick={() => approve.mutate(r.id)}
                            disabled={approve.isPending}
                            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => {
                              setRejectingId(rejectingId === r.id ? null : r.id);
                              setRejectRemarks("");
                            }}
                            className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {(r.status === "pending" || r.status === "approved") && (
                        <button onClick={() => cancel.mutate(r.id)} disabled={cancel.isPending} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60">Cancel</button>
                      )}
                    </div>
                  </td>
                </tr>
                {rejectingId === r.id && (
                  <tr key={`${r.id}-reject`} className="border-t border-red-100 bg-red-50/50">
                    <td colSpan={colSpan} className="px-4 py-3">
                      <div className="flex items-end gap-3">
                        <div className="flex-1">
                          <label className="mb-1 block text-xs font-medium text-red-700">Rejection reason</label>
                          <input
                            type="text"
                            className="w-full rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-red-400"
                            placeholder="Optional remarks for the employee…"
                            value={rejectRemarks}
                            onChange={(e) => setRejectRemarks(e.target.value)}
                            autoFocus
                          />
                        </div>
                        <button
                          onClick={() => reject.mutate({ id: r.id, remarks: rejectRemarks })}
                          disabled={reject.isPending}
                          className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-60 whitespace-nowrap"
                        >
                          {reject.isPending ? "Rejecting…" : "Confirm reject"}
                        </button>
                        <button
                          onClick={() => setRejectingId(null)}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}
