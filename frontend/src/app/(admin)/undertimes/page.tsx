"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { getMe, type Me } from "@/lib/auth";
import { EmployeeSearchSelect } from "@/components/EmployeeSearchSelect";
import { dtrApi } from "@/lib/attendance";
import { undertimeApi, type UndertimeInput, type UndertimeRequest } from "@/lib/approvals";

// ── helpers ───────────────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

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

const STATUS_STYLE: Record<string, string> = {
  pending:   "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  approved:  "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  rejected:  "bg-red-50 text-red-700 ring-1 ring-red-200",
  cancelled: "bg-slate-100 text-slate-500",
};

const inputCls = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100";

// ── page ──────────────────────────────────────────────────────────────────

export default function UndertimesPage() {
  const qc = useQueryClient();
  const { data: meData } = useQuery({ queryKey: ["me"], queryFn: getMe });

  const user      = meData?.user;
  const perms     = user?.permissions ?? [];
  const isHR      = perms.includes("attendance.view.any") || perms.includes("attendance.manage");
  const isApprover = !isHR && (perms.includes("attendance.approve.any") || perms.includes("attendance.approve.self_dept"));
  const canManage = perms.includes("attendance.manage");
  const employeeId = user?.employee?.id ?? null;

  const showQueue = isHR || isApprover;

  const { data: pendingRequests = [], isLoading: pendingLoading } = useQuery({
    queryKey: ["undertime-requests", "pending", isHR ? "all" : "dept"],
    queryFn: () => undertimeApi.list({ status: "pending" }),
    select: (res) => res.data,
    enabled: showQueue,
    staleTime: 30_000,
  });

  const { data: myRequests = [], isLoading: myLoading } = useQuery({
    queryKey: ["undertime-requests", "mine", employeeId],
    queryFn: () => undertimeApi.list({ employee_id: employeeId! }),
    select: (res) => res.data,
    enabled: !!employeeId,
    staleTime: 30_000,
  });

  const queueLabel = isHR ? "Pending approval — all employees" : "Pending approval — your department";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Undertimes</h2>
        <p className="text-sm text-slate-500">
          {isHR
            ? "Review and approve undertime requests across all employees."
            : isApprover
            ? "Approve or reject undertime requests from your department."
            : "File and track your undertime requests."}
        </p>
      </div>

      <StatsBar employeeId={employeeId} isHR={isHR} isApprover={isApprover} />

      {employeeId && <FileUTForm employeeId={employeeId} canManage={canManage} meData={meData} />}

      {showQueue && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-700">{queueLabel}</h3>
          {pendingLoading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : pendingRequests.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-400">
              No pending undertime requests.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 text-left">Employee</th>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Time</th>
                    <th className="px-4 py-3 text-left">Hours</th>
                    <th className="px-4 py-3 text-left">Reason</th>
                    <th className="px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingRequests.map((r) => (
                    <ApproverRow key={r.id} request={r} onDone={() => qc.invalidateQueries({ queryKey: ["undertime-requests"] })} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {employeeId && (
        <MyHistory requests={myRequests} isLoading={myLoading} />
      )}
    </div>
  );
}

// ── Stats bar ─────────────────────────────────────────────────────────────

function StatsBar({ employeeId, isHR, isApprover }: { employeeId: number | null; isHR: boolean; isApprover: boolean }) {
  const { data: all = [] } = useQuery({
    queryKey: ["undertime-requests", "stats", isHR, isApprover, employeeId],
    queryFn: () => isHR || isApprover
      ? undertimeApi.list()
      : undertimeApi.list({ employee_id: employeeId! }),
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

// ── File UT form ──────────────────────────────────────────────────────────

function FileUTForm({ employeeId, canManage, meData }: { employeeId: number; canManage: boolean; meData: Me | undefined }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<UndertimeInput>({
    date: "", start_time: "", end_time: "", requested_hours: 0, reason: "", classification: "normal",
  });
  const [adminEmployeeId, setAdminEmployeeId] = useState<number>(employeeId);
  const targetEmpId = canManage ? adminEmployeeId : employeeId;

  const { data: dtrs = [] } = useQuery({
    queryKey: ["dtr", targetEmpId, form.date],
    queryFn: () => dtrApi.list({ employee_id: targetEmpId, from: form.date, to: form.date }),
    enabled: !!form.date && !!targetEmpId,
    staleTime: 60_000,
  });
  const dtr = dtrs[0] ?? null;

  const create = useMutation({
    mutationFn: () => undertimeApi.create({ ...form, employee_id: targetEmpId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["undertime-requests"] });
      setForm({ date: "", start_time: "", end_time: "", requested_hours: 0, reason: "", classification: "normal" });
      setOpen(false);
    },
  });

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
      <div className="flex items-center justify-between px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-800">File undertime request</p>
          <p className="text-xs text-slate-500">Submit a request for leaving before your scheduled end of shift.</p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
        >
          {open ? "Cancel" : "+ File UT"}
        </button>
      </div>

      {open && (
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="border-t border-slate-200">
          <div className="bg-slate-50 px-6 py-3 border-b border-slate-200">
            <h3 className="text-base font-semibold text-slate-800">Undertime Application Form</h3>
          </div>

          <div className="flex flex-col lg:flex-row">
            {/* ── Left: employee info ── */}
            <div className="w-full lg:w-56 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 px-5 py-5 space-y-2.5 text-sm">
              {canManage && (
                <div className="mb-3">
                  <label className="mb-1 block text-xs font-medium text-slate-500">Employee</label>
                  <EmployeeSearchSelect
                    className="w-full"
                    value={adminEmployeeId || ""}
                    onChange={(id) => setAdminEmployeeId(id === "" ? 0 : Number(id))}
                    placeholder="Select…"
                  />
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
                      {["Shift", "Biometric Logs", "Undertime", "UT Minutes"].map((h) => (
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
                        {dtr && dtr.undertime_minutes > 0 ? `${Math.floor(dtr.undertime_minutes / 60)}h ${dtr.undertime_minutes % 60}m` : "NO UT"}
                      </td>
                      <td className="px-3 py-2 font-semibold text-slate-800">
                        {dtr?.undertime_minutes ?? 0}
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

              {/* Shift from / to */}
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

              {/* Undertime Details */}
              <div>
                <p className="mb-3 text-sm font-semibold text-blue-700 border-b border-slate-200 pb-1">Undertime Details:</p>
                <div className="flex flex-wrap gap-4">
                  <div className="w-44">
                    <label className="mb-1 block text-xs font-medium text-slate-500">Early departure time</label>
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
                  <div className="w-44">
                    <label className="mb-1 block text-xs font-medium text-slate-500">Scheduled end time</label>
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

                {form.requested_hours > 0 && (
                  <p className="mt-2 text-xs text-slate-500">
                    Computed: <span className="font-semibold text-slate-800">{form.requested_hours}h undertime</span>
                  </p>
                )}
              </div>

              {/* Reason */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Reason</label>
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={3}
                  placeholder="Briefly explain why you need to leave early…"
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  required
                />
              </div>

              {create.isError && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                  Failed to submit. Please check all required fields.
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end border-t border-slate-200 px-6 py-4">
            <button
              type="submit"
              disabled={create.isPending}
              className="rounded-lg bg-blue-700 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
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
      <span className="text-xs font-semibold text-blue-700">{value}</span>
    </div>
  );
}

// ── Approver row ──────────────────────────────────────────────────────────

function ApproverRow({ request: r, onDone }: { request: UndertimeRequest; onDone: () => void }) {
  const [remarks, setRemarks] = useState("");
  const [acting, setActing] = useState<"approve" | "reject" | null>(null);

  const approve = useMutation({
    mutationFn: () => undertimeApi.approve(r.id, remarks || undefined),
    onSuccess: onDone,
  });
  const reject = useMutation({
    mutationFn: () => undertimeApi.reject(r.id, remarks || undefined),
    onSuccess: onDone,
  });

  return (
    <>
      <tr className="hover:bg-slate-50/60">
        <td className="px-4 py-3">
          <Link href={`/undertimes/${r.id}`} className="font-medium text-slate-800 hover:underline">
            {r.employee?.full_name ?? `#${r.employee_id}`}
          </Link>
          <p className="text-xs text-slate-500">{r.employee?.employee_no}</p>
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
          <td colSpan={5} className="px-4 pb-3 pt-1">
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

// ── My history ────────────────────────────────────────────────────────────

function MyHistory({ requests, isLoading }: { requests: UndertimeRequest[]; isLoading: boolean }) {
  const qc = useQueryClient();

  const cancel = useMutation({
    mutationFn: (id: number) => undertimeApi.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["undertime-requests"] }),
  });

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>;
  if (requests.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-400">
        No undertime requests yet. File one above.
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
                    <Link href={`/undertimes/${r.id}`} className="text-xs text-slate-500 hover:text-slate-800 hover:underline">View</Link>
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
