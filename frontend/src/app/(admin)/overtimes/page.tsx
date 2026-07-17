"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { getMe, type Me } from "@/lib/auth";
import { listEmployees } from "@/lib/employees";
import { dtrApi } from "@/lib/attendance";
import { overtimeApi, type OTClassification, type OvertimeInput, type OvertimeRequest } from "@/lib/approvals";
import { ImportDataButton } from "@/components/ImportDataButton";

// ── helpers ───────────────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_STYLE: Record<string, string> = {
  pending:   "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  approved:  "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  rejected:  "bg-red-50 text-red-700 ring-1 ring-red-200",
  cancelled: "bg-slate-100 text-slate-500",
};

const inputCls = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100";

// ── Classification badge ──────────────────────────────────────────────────

function ClassificationBadge({ cls }: { cls: OTClassification }) {
  return cls === "early" ? (
    <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700 ring-1 ring-sky-200">Early OT</span>
  ) : (
    <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-700 ring-1 ring-violet-200">Normal OT</span>
  );
}

// ── page ──────────────────────────────────────────────────────────────────

export default function OvertimesPage() {
  const qc = useQueryClient();
  const { data: meData } = useQuery({ queryKey: ["me"], queryFn: getMe });

  const user       = meData?.user;
  const perms      = user?.permissions ?? [];
  // HR / IT: can see ALL overtime requests across all employees
  const isHR       = perms.includes("attendance.view.any") || perms.includes("attendance.manage");
  // Dept head / approver: can approve/reject dept requests only, cannot browse all
  const isApprover = !isHR && (perms.includes("attendance.approve.any") || perms.includes("attendance.approve.self_dept"));
  // Can file OT on behalf of another employee (HR/IT only)
  const canManage  = perms.includes("attendance.manage");
  const employeeId = user?.employee?.id ?? null;

  const showQueue = isHR || isApprover;

  // For HR: pending queue across all employees
  // For approvers: backend scopes to their dept automatically
  const { data: pendingRequests = [], isLoading: pendingLoading } = useQuery({
    queryKey: ["overtime-requests", "pending", isHR ? "all" : "dept"],
    queryFn: () => overtimeApi.list({ status: "pending" }),
    select: (res) => res.data,
    enabled: showQueue,
    staleTime: 30_000,
  });

  // Employee's own history (shown for everyone with an employee record)
  const { data: myRequests = [], isLoading: myLoading } = useQuery({
    queryKey: ["overtime-requests", "mine", employeeId],
    queryFn: () => overtimeApi.list({ employee_id: employeeId! }),
    select: (res) => res.data,
    enabled: !!employeeId,
    staleTime: 30_000,
  });

  const queueLabel = isHR ? "Pending approval — all employees" : "Pending approval — your department";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Overtimes</h2>
          <p className="text-sm text-slate-500">
            {isHR
              ? "Review and approve overtime requests across all employees."
              : isApprover
              ? "Approve or reject overtime requests from your department."
              : "File and track your overtime requests."}
          </p>
        </div>
        {perms.includes("attendance.approve.any") && (
          <ImportDataButton
            label="Import overtime"
            title="Import approved overtime"
            description="Bulk-upload an overtime report. One row per employee per day; existing records (same employee, date & start time) are skipped."
            columns="EmpIDNo · Shift Date · Type · Approved OT Schedule · OT Approved Minutes"
            templateUrl={overtimeApi.importTemplateUrl}
            importFn={overtimeApi.import}
            invalidateKeys={[["overtime-requests"], ["overtimes"]]}
          />
        )}
      </div>

      {/* Stats */}
      <StatsBar employeeId={employeeId} isHR={isHR} isApprover={isApprover} />

      {/* File OT form — everyone with an employee record can file for self; HR/managers can file for others */}
      {employeeId && <FileOTForm employeeId={employeeId} canManage={canManage} meData={meData} />}

      {/* Approval queue — HR sees all, dept heads see their dept (backend-scoped) */}
      {showQueue && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-700">{queueLabel}</h3>
          {pendingLoading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : pendingRequests.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-400">
              No pending overtime requests.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 text-left">Employee</th>
                    <th className="px-4 py-3 text-left">Classification</th>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Time</th>
                    <th className="px-4 py-3 text-left">Hours</th>
                    <th className="px-4 py-3 text-left">Reason</th>
                    <th className="px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingRequests.map((r) => (
                    <AdminRow key={r.id} request={r} onDone={() => qc.invalidateQueries({ queryKey: ["overtime-requests"] })} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Own request history — shown for every user who has an employee record */}
      {employeeId && (
        <MyHistory requests={myRequests} isLoading={myLoading} />
      )}
    </div>
  );
}

// ── Stats bar ─────────────────────────────────────────────────────────────

function StatsBar({ employeeId, isHR, isApprover }: { employeeId: number | null; isHR: boolean; isApprover: boolean }) {
  const { data: all = [] } = useQuery({
    queryKey: ["overtime-requests", "stats", isHR, isApprover, employeeId],
    queryFn: () => isHR
      ? overtimeApi.list()
      : isApprover
      ? overtimeApi.list()  // backend scopes to dept
      : overtimeApi.list({ employee_id: employeeId! }),
    select: (res) => res.data,
    enabled: isHR || isApprover || !!employeeId,
    staleTime: 60_000,
  });

  const pending  = all.filter((r) => r.status === "pending").length;
  const approved = all.filter((r) => r.status === "approved").length;
  const rejected = all.filter((r) => r.status === "rejected").length;

  return (
    <div className="grid grid-cols-3 gap-3">
      {[
        { label: "Pending",  value: pending,  color: "border-l-amber-400"   },
        { label: "Approved", value: approved, color: "border-l-emerald-500" },
        { label: "Rejected", value: rejected, color: "border-l-red-400"     },
      ].map(({ label, value, color }) => (
        <div key={label} className={`rounded-xl border border-slate-200 border-l-4 ${color} bg-white px-4 py-3`}>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
          <p className="text-xs text-slate-500">{label}</p>
        </div>
      ))}
    </div>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────

function to12h(time24: string | null): string {
  if (!time24) return "—";
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

function dayName(dateStr: string): string {
  if (!dateStr) return "—";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-PH", { weekday: "long" });
}

// ── File OT form ──────────────────────────────────────────────────────────

function FileOTForm({ employeeId, canManage, meData }: { employeeId: number; canManage: boolean; meData: Me | undefined }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<OvertimeInput>({
    date: "", start_time: "", end_time: "", requested_hours: 0, reason: "", classification: "normal", ticket_number: "",
  });
  const [attachment, setAttachment] = useState<File | null>(null);
  const [adminEmployeeId, setAdminEmployeeId] = useState<number>(employeeId);
  const targetEmpId = canManage ? adminEmployeeId : employeeId;

  const { data: empPage } = useQuery({
    queryKey: ["employees", { all: true }],
    queryFn: () => listEmployees({ perPage: 200 }),
    enabled: canManage,
    staleTime: 60_000,
  });

  // Fetch DTR for selected date to show shift / biometric info
  const { data: dtrs = [] } = useQuery({
    queryKey: ["dtr", targetEmpId, form.date],
    queryFn: () => dtrApi.list({ employee_id: targetEmpId, from: form.date, to: form.date }),
    enabled: !!form.date && !!targetEmpId,
    staleTime: 60_000,
  });
  const dtr = dtrs[0] ?? null;

  const create = useMutation({
    mutationFn: () => overtimeApi.create({ ...form, employee_id: targetEmpId, attachment }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["overtime-requests"] });
      setForm({ date: "", start_time: "", end_time: "", requested_hours: 0, reason: "", classification: "normal", ticket_number: "" });
      setAttachment(null);
      setOpen(false);
    },
  });

  // Auto-compute requested_hours from start/end time
  const computeHours = (start: string, end: string): number => {
    if (!start || !end) return 0;
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const diff = (eh * 60 + em) - (sh * 60 + sm);
    return Math.max(0, Math.round(diff / 15) * 0.25);
  };

  const employee = meData?.user?.employee;
  const today = new Date().toLocaleDateString("en-PH", { month: "numeric", day: "2-digit", year: "numeric" });

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Toggle bar */}
      <div className="flex items-center justify-between px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-800">File overtime request</p>
          <p className="text-xs text-slate-500">Submit an OT request for approval.</p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
        >
          {open ? "Cancel" : "+ File OT"}
        </button>
      </div>

      {open && (
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="border-t border-slate-200">
          {/* Form title */}
          <div className="bg-slate-50 px-6 py-3 border-b border-slate-200">
            <h3 className="text-base font-semibold text-slate-800">Overtime Application Form</h3>
          </div>

          <div className="flex flex-col lg:flex-row">
            {/* ── Left: employee info ── */}
            <div className="w-full lg:w-56 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 px-5 py-5 space-y-2.5 text-sm">
              {canManage && (
                <div className="mb-3">
                  <label className="mb-1 block text-xs font-medium text-slate-500">Employee</label>
                  <select
                    className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-slate-400"
                    value={adminEmployeeId}
                    onChange={(e) => setAdminEmployeeId(Number(e.target.value))}
                    required
                  >
                    <option value="">Select…</option>
                    {empPage?.data.map((e) => (
                      <option key={e.id} value={e.id}>{e.full_name}</option>
                    ))}
                  </select>
                </div>
              )}
              <InfoRow label="Name" value={employee?.full_name ?? "—"} />
              <InfoRow label="Position" value={employee?.position ?? "—"} />
              <InfoRow label="Account / Department" value={employee?.department ?? "—"} />
              <InfoRow label="Date Submitted" value={today} />
              <InfoRow label="Shift Schedule" value={dtr ? `${to12h(dtr.scheduled_in)} To ${to12h(dtr.scheduled_out)}` : "— select date —"} />
            </div>

            {/* ── Right: shift info + form fields ── */}
            <div className="flex-1 px-6 py-5 space-y-5">

              {/* Shift summary table */}
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {["Shift", "Biometric Logs", "OT", "OT Minutes"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-semibold text-slate-600">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-3 py-2 text-slate-700">
                        {dtr ? `${to12h(dtr.scheduled_in)} To ${to12h(dtr.scheduled_out)}` : "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {dtr?.actual_in ? `${to12h(dtr.actual_in)} – ${to12h(dtr.actual_out)}` : "NO LOGS"}
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {dtr && dtr.overtime_minutes > 0 ? `${Math.floor(dtr.overtime_minutes / 60)}h ${dtr.overtime_minutes % 60}m` : "NO OT"}
                      </td>
                      <td className="px-3 py-2 font-semibold text-slate-800">
                        {dtr?.overtime_minutes ?? 0}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Date row */}
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-500">Day</p>
                  <p className="font-medium text-slate-800">{form.date ? dayName(form.date) : "—"}</p>
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-500">Shift Date</label>
                  <input
                    type="date"
                    className={inputCls}
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    required
                  />
                </div>
              </div>

              {/* Shift from / to (read-only from DTR) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-500">Shift from</p>
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {dtr ? to12h(dtr.scheduled_in) : "—"}
                  </p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-500">To</p>
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {dtr ? to12h(dtr.scheduled_out) : "—"}
                  </p>
                </div>
              </div>

              {/* Overtime Details */}
              <div>
                <p className="mb-3 text-sm font-semibold text-slate-800 border-b border-slate-200 pb-1">Overtime Details:</p>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">OT Classification</label>
                    <select
                      className={inputCls}
                      value={form.classification}
                      onChange={(e) => setForm({ ...form, classification: e.target.value as OTClassification })}
                      required
                    >
                      <option value="normal">Normal OT</option>
                      <option value="early">Early OT</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Start</label>
                    <input
                      type="time"
                      className={inputCls}
                      value={form.start_time}
                      onChange={(e) => {
                        const hrs = computeHours(e.target.value, form.end_time);
                        setForm({ ...form, start_time: e.target.value, requested_hours: hrs || form.requested_hours });
                      }}
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">End</label>
                    <input
                      type="time"
                      className={inputCls}
                      value={form.end_time}
                      onChange={(e) => {
                        const hrs = computeHours(form.start_time, e.target.value);
                        setForm({ ...form, end_time: e.target.value, requested_hours: hrs || form.requested_hours });
                      }}
                      required
                    />
                  </div>
                </div>

                {/* Computed hours display */}
                {form.requested_hours > 0 && (
                  <p className="mt-2 text-xs text-slate-500">
                    Computed: <span className="font-semibold text-slate-800">{form.requested_hours}h</span>
                  </p>
                )}
              </div>

              {/* File attachment + reason */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">File Attachment</label>
                  <p className="mb-1 text-[10px] text-slate-400">5MB maximum file size, allowed file types: jpg, png, doc, pdf</p>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.doc,.docx,.pdf"
                    className="block w-full text-xs text-slate-600 file:mr-3 file:rounded file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-50"
                    onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Indicate Ticket Number (If Applicable) and Reason
                  </label>
                  <textarea
                    className={`${inputCls} resize-none`}
                    rows={3}
                    placeholder="e.g. TICKET-001 — Reason for overtime…"
                    value={form.reason}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                    required
                  />
                </div>
              </div>

              {create.isError && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                  Failed to submit. Please check all required fields.
                </p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end border-t border-slate-200 px-6 py-4">
            <button
              type="submit"
              disabled={create.isPending}
              className="rounded-lg bg-green-700 px-6 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-60"
            >
              {create.isPending ? "Submitting…" : "Apply"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs text-slate-500">{label}: </span>
      <span className="text-xs font-semibold text-slate-800">{value}</span>
    </div>
  );
}

// ── Admin row with inline approve/reject ──────────────────────────────────

function AdminRow({ request: r, onDone }: { request: OvertimeRequest; onDone: () => void }) {
  const [remarks, setRemarks] = useState("");
  const [acting, setActing] = useState<"approve" | "reject" | null>(null);

  const approve = useMutation({
    mutationFn: () => overtimeApi.approve(r.id, remarks || undefined),
    onSuccess: onDone,
  });
  const reject = useMutation({
    mutationFn: () => overtimeApi.reject(r.id, remarks || undefined),
    onSuccess: onDone,
  });

  return (
    <>
      <tr className="hover:bg-slate-50/60">
        <td className="px-4 py-3">
          <Link href={`/overtimes/${r.id}`} className="font-medium text-slate-800 hover:underline">
            {r.employee?.full_name ?? `#${r.employee_id}`}
          </Link>
          <p className="text-xs text-slate-500">{r.employee?.employee_no}</p>
        </td>
        <td className="px-4 py-3">
          <ClassificationBadge cls={r.classification} />
        </td>
        <td className="px-4 py-3 font-mono text-xs">{fmt(r.date)}</td>
        <td className="px-4 py-3 text-xs text-slate-600">{r.start_time}–{r.end_time}</td>
        <td className="px-4 py-3 font-semibold">{r.requested_hours}h</td>
        <td className="px-4 py-3 max-w-xs">
          <span className="line-clamp-2 text-xs text-slate-600">{r.reason}</span>
        </td>
        <td className="px-4 py-3">
          <div className="flex gap-1.5">
            <button onClick={() => setActing(acting === "approve" ? null : "approve")} className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700">Approve</button>
            <button onClick={() => setActing(acting === "reject" ? null : "reject")} className="rounded-md border border-red-300 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50">Reject</button>
          </div>
        </td>
      </tr>
      {acting && (
        <tr className="bg-slate-50/80">
          <td colSpan={6} className="px-4 pb-3 pt-1">
            <div className="flex items-center gap-2">
              <input
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-slate-400"
                placeholder={acting === "reject" ? "Rejection reason (required)…" : "Remarks (optional)…"}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
              <button
                disabled={approve.isPending || reject.isPending || (acting === "reject" && !remarks.trim())}
                onClick={() => acting === "approve" ? approve.mutate() : reject.mutate()}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 ${acting === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}
              >
                {approve.isPending || reject.isPending ? "Saving…" : acting === "approve" ? "Confirm approve" : "Confirm reject"}
              </button>
              <button onClick={() => { setActing(null); setRemarks(""); }} className="text-xs text-slate-400 hover:text-slate-700">Cancel</button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Employee history ──────────────────────────────────────────────────────

function MyHistory({ requests, isLoading }: { requests: OvertimeRequest[]; isLoading: boolean }) {
  const qc = useQueryClient();

  const cancel = useMutation({
    mutationFn: (id: number) => overtimeApi.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["overtime-requests"] }),
  });

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>;
  if (requests.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-400">
        No overtime requests yet. File one above.
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-700">My requests</h3>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 text-left">Classification</th>
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-left">Time</th>
              <th className="px-4 py-3 text-left">Hours</th>
              <th className="px-4 py-3 text-left">Reason</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {requests.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/60">
                <td className="px-4 py-3"><ClassificationBadge cls={r.classification} /></td>
                <td className="px-4 py-3 font-mono text-xs">{fmt(r.date)}</td>
                <td className="px-4 py-3 text-xs text-slate-600">{r.start_time}–{r.end_time}</td>
                <td className="px-4 py-3 font-semibold">{r.requested_hours}h</td>
                <td className="px-4 py-3 max-w-xs">
                  <span className="line-clamp-2 text-xs text-slate-600">{r.reason}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLE[r.status]}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Link href={`/overtimes/${r.id}`} className="text-xs text-slate-500 hover:text-slate-800 hover:underline">View</Link>
                    {r.status === "pending" && (
                      <button
                        onClick={() => cancel.mutate(r.id)}
                        disabled={cancel.isPending}
                        className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
