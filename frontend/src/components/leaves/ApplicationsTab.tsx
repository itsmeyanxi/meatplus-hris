"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { StatusPill } from "@/components/approvals/StatusPill";
import { AppButton, AppCard, TableShell } from "@/components/ui";
import { EmployeeSearchSelect } from "@/components/EmployeeSearchSelect";
import { SearchSelect } from "@/components/SearchSelect";
import { getMe } from "@/lib/auth";
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
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  // canApproveAny: can act on any employee's leave (dept_head, it_admin, hr_admin)
  const canApproveAny = me?.user.permissions.includes("leave.approve.any") ?? false;
  // canApprove: can approve/reject — includes supervisors/team_leads who manage direct reports
  const canApprove = canApproveAny || (me?.user.permissions.includes("leave.approve.self_dept") ?? false);
  // showFile: own employee record exists (file own) OR canApproveAny (file on behalf of others)
  const showFile = Boolean(me?.user.employee) || canApproveAny;

  const { data: types = [] } = useQuery({ queryKey: ["leave-types"], queryFn: leaveTypesApi.list });

  const [status, setStatus] = useState<LeaveStatus | "">("");
  // Dept-head/HR filters: find a specific employee's or leave type's requests fast.
  const [filterEmployee, setFilterEmployee] = useState<number | "">("");
  const [filterType, setFilterType] = useState<number | "">("");
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectRemarks, setRejectRemarks] = useState("");
  const { data: items = [] } = useQuery({
    queryKey: ["leave-apps", { status, filterEmployee, filterType }],
    queryFn: () => leaveAppsApi.list({
      status: status || undefined,
      employee_id: filterEmployee === "" ? undefined : Number(filterEmployee),
      leave_type_id: filterType === "" ? undefined : Number(filterType),
    }),
  });
  const pendingCount = items.filter((r) => r.status === "pending").length;

  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState<LeaveAppInput>({
    employee_id: undefined,
    leave_type_id: 0,
    date_from: "",
    date_to: "",
    reason: "",
    attachment: null,
  });
  const [attachmentName, setAttachmentName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const selectedType = types.find((t) => t.id === form.leave_type_id);

  const resetForm = () => {
    setForm({ employee_id: undefined, leave_type_id: 0, date_from: "", date_to: "", reason: "", attachment: null });
    setAttachmentName("");
    setError(null);
    setIsAdding(false);
  };

  const create = useMutation({
    mutationFn: () => leaveAppsApi.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-apps"] });
      qc.invalidateQueries({ queryKey: ["leave-balances"] });
      resetForm();
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { errors?: Record<string, string[]>; message?: string } } };
      const msgs = err?.response?.data?.errors;
      setError(msgs ? Object.values(msgs).flat().join(" ") : err?.response?.data?.message ?? "Failed");
    },
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setForm((f) => ({ ...f, attachment: file }));
    setAttachmentName(file?.name ?? "");
  };
  const approve = useMutation({
    mutationFn: (id: number) => leaveAppsApi.approve(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-apps"] }); qc.invalidateQueries({ queryKey: ["leave-balances"] }); },
    meta: { successMessage: "Leave approved" },
  });
  const reject = useMutation({
    mutationFn: ({ id, remarks }: { id: number; remarks: string }) =>
      leaveAppsApi.reject(id, remarks || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-apps"] });
      setRejectingId(null);
      setRejectRemarks("");
    },
    meta: { successMessage: "Leave rejected" },
  });
  const cancel = useMutation({
    mutationFn: (id: number) => leaveAppsApi.cancel(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-apps"] }); qc.invalidateQueries({ queryKey: ["leave-balances"] }); },
    meta: { successMessage: "Leave cancelled" },
  });

  const colSpan = canApprove ? 8 : 7;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {items.length} shown{canApproveAny ? "" : canApprove ? " — your team" : " — your own only"}
          {canApprove && pendingCount > 0 && (
            <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {pendingCount} pending
            </span>
          )}
        </p>
        {showFile && (
          <AppButton variant={isAdding ? "secondary" : "primary"} onClick={() => { if (isAdding) resetForm(); else setIsAdding(true); }}>
            {isAdding ? "Cancel" : "+ File leave"}
          </AppButton>
        )}
      </div>

      {isAdding && (
        <AppCard title="File a leave request">
          <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {canApproveAny && (
              <div>
                <label className={labelCls}>Employee *</label>
                <EmployeeSearchSelect
                  className={inputCls}
                  value={form.employee_id ?? ""}
                  onChange={(id) => setForm({ ...form, employee_id: id === "" ? undefined : Number(id) })}
                  placeholder="Select employee…"
                />
              </div>
            )}
            <div>
              <label className={labelCls}>Leave type *</label>
              <SearchSelect
                className={inputCls}
                value={form.leave_type_id || ""}
                onChange={(v) => setForm({ ...form, leave_type_id: Number(v) })}
                placeholder="Select type…"
                options={types.map((t) => ({ value: String(t.id), label: `${t.code} — ${t.name}` }))}
              />
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

            {/* Attachment */}
            <div className="sm:col-span-2">
              <label className={labelCls}>
                Supporting document
                {selectedType?.requires_attachment && <span className="ml-1 text-red-500">*</span>}
                {!selectedType?.requires_attachment && <span className="ml-1 font-normal text-slate-400">(optional)</span>}
              </label>
              <label className={[
                "mt-1 flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 transition",
                form.attachment
                  ? "border-emerald-300 bg-emerald-50"
                  : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
              ].join(" ")}>
                <svg className={`h-5 w-5 shrink-0 ${form.attachment ? "text-emerald-600" : "text-slate-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                </svg>
                <div className="min-w-0 flex-1">
                  {form.attachment ? (
                    <span className="truncate text-sm font-medium text-emerald-700">{attachmentName}</span>
                  ) : (
                    <span className="text-sm text-slate-500">Click to browse or drag a file here</span>
                  )}
                  <p className="text-xs text-slate-400 mt-0.5">jpg, png, pdf, doc, docx · max 5 MB</p>
                </div>
                {form.attachment && (
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setForm((f) => ({ ...f, attachment: null })); setAttachmentName(""); }}
                    className="shrink-0 text-slate-400 hover:text-red-500 transition"
                    title="Remove file"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf,.doc,.docx"
                  className="hidden"
                  required={selectedType?.requires_attachment && !form.attachment}
                  onChange={handleFile}
                />
              </label>
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
                ? "rounded-full bg-brand-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm"
                : "rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Approver search: jump straight to one employee's or one type's requests. */}
      {canApprove && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <div className="min-w-[240px] flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500">Find employee</label>
            <EmployeeSearchSelect
              className={inputCls}
              value={filterEmployee}
              onChange={(id) => setFilterEmployee(id === "" ? "" : Number(id))}
              placeholder="Search by name or ID…"
            />
          </div>
          <div className="min-w-[200px]">
            <label className="mb-1 block text-xs font-medium text-slate-500">Leave type</label>
            <SearchSelect
              className={inputCls}
              value={filterType === "" ? "" : String(filterType)}
              onChange={(v) => setFilterType(v === "" ? "" : Number(v))}
              placeholder="All types"
              options={[{ value: "", label: "All types" }, ...types.map((t) => ({ value: String(t.id), label: `${t.code} — ${t.name}` }))]}
            />
          </div>
          {(filterEmployee !== "" || filterType !== "") && (
            <button
              onClick={() => { setFilterEmployee(""); setFilterType(""); }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Clear
            </button>
          )}
        </div>
      )}

      <TableShell>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Status</th>
              {canApprove && <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Employee</th>}
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Type</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Dates</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Days</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Reason</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">File</th>
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
                  {canApprove && (
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{r.employee?.full_name}</div>
                      <div className="font-mono text-xs text-slate-400">{r.employee?.employee_no}</div>
                    </td>
                  )}
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.leave_type.code}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.date_from} → {r.date_to}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{r.days_count}</td>
                  <td className="max-w-xs px-4 py-3 text-slate-600">{r.reason}</td>
                  <td className="px-4 py-3">
                    {r.attachment_path ? (
                      <a
                        href={leaveAppsApi.attachmentUrl(r.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
                        title="View attachment"
                      >
                        <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" /></svg>
                        View
                      </a>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
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
