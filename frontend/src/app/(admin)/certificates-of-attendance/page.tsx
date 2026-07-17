"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getMe, type Me } from "@/lib/auth";
import { listEmployees } from "@/lib/employees";
import {
  certificateOfAttendanceApi,
  type CertificateOfAttendanceInput,
  type CertificateOfAttendanceRequest,
} from "@/lib/approvals";

// ── helpers ───────────────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}
function to12h(t: string | null): string {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
const MISSED_LABEL: Record<string, string> = { in: "Time In", out: "Time Out", both: "Both" };

const STATUS_STYLE: Record<string, string> = {
  pending:   "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  approved:  "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  rejected:  "bg-red-50 text-red-700 ring-1 ring-red-200",
  cancelled: "bg-slate-100 text-slate-500",
};
const inputCls = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100";

function blankForm(): CertificateOfAttendanceInput {
  return { work_date: "", missed_punch: "in", claimed_time_in: "", claimed_time_out: "", reason: "" };
}

// ── page ──────────────────────────────────────────────────────────────────

export default function CertificatesOfAttendancePage() {
  const qc = useQueryClient();
  const { data: meData } = useQuery({ queryKey: ["me"], queryFn: getMe });

  const user       = meData?.user;
  const perms      = user?.permissions ?? [];
  const isHR       = perms.includes("attendance.view.any") || perms.includes("attendance.manage");
  const isApprover = !isHR && (perms.includes("attendance.approve.any") || perms.includes("attendance.approve.self_dept"));
  const canManage  = perms.includes("attendance.manage");
  const employeeId = user?.employee?.id ?? null;

  const showQueue = isHR || isApprover;
  const queueLabel = isHR ? "Pending approval — all employees" : "Pending approval — your department";

  const { data: pendingRequests = [], isLoading: pendingLoading } = useQuery({
    queryKey: ["coa-requests", "pending", isHR ? "all" : "dept"],
    queryFn: () => certificateOfAttendanceApi.list({ status: "pending" }),
    select: (res) => res.data,
    enabled: showQueue,
    staleTime: 30_000,
  });

  const { data: myRequests = [], isLoading: myLoading } = useQuery({
    queryKey: ["coa-requests", "mine", employeeId],
    queryFn: () => certificateOfAttendanceApi.list({ employee_id: employeeId! }),
    select: (res) => res.data,
    enabled: !!employeeId,
    staleTime: 30_000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Certificate of Attendance</h2>
        <p className="text-sm text-slate-500">
          {isHR
            ? "Review and approve certificate-of-attendance requests (missed punches) across all employees."
            : isApprover
            ? "Approve or reject certificate-of-attendance requests from your department."
            : "File a certificate of attendance when you missed a punch, and track your requests."}
        </p>
      </div>

      <StatsBar employeeId={employeeId} isHR={isHR} isApprover={isApprover} />

      {employeeId && <FileCOAForm employeeId={employeeId} canManage={canManage} meData={meData} />}

      {showQueue && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-700">{queueLabel}</h3>
          {pendingLoading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : pendingRequests.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-400">
              No pending certificate-of-attendance requests.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 text-left">Employee</th>
                    <th className="px-4 py-3 text-left">Work Date</th>
                    <th className="px-4 py-3 text-left">Missed</th>
                    <th className="px-4 py-3 text-left">Claimed In/Out</th>
                    <th className="px-4 py-3 text-left">Reason</th>
                    <th className="px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingRequests.map((r) => (
                    <ApproverRow key={r.id} request={r} onDone={() => qc.invalidateQueries({ queryKey: ["coa-requests"] })} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {employeeId && <MyHistory requests={myRequests} isLoading={myLoading} />}
    </div>
  );
}

// ── Stats bar ─────────────────────────────────────────────────────────────

function StatsBar({ employeeId, isHR, isApprover }: { employeeId: number | null; isHR: boolean; isApprover: boolean }) {
  const { data: all = [] } = useQuery({
    queryKey: ["coa-requests", "stats", isHR, isApprover, employeeId],
    queryFn: () => isHR || isApprover
      ? certificateOfAttendanceApi.list()
      : certificateOfAttendanceApi.list({ employee_id: employeeId! }),
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

// ── File COA form ─────────────────────────────────────────────────────────

function FileCOAForm({ employeeId, canManage, meData }: { employeeId: number; canManage: boolean; meData: Me | undefined }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CertificateOfAttendanceInput>(blankForm());
  const [adminEmployeeId, setAdminEmployeeId] = useState<number>(employeeId);
  const targetEmpId = canManage ? adminEmployeeId : employeeId;

  const needIn  = form.missed_punch === "in"  || form.missed_punch === "both";
  const needOut = form.missed_punch === "out" || form.missed_punch === "both";

  const { data: empPage } = useQuery({
    queryKey: ["employees", { all: true }],
    queryFn: () => listEmployees({ perPage: 200 }),
    enabled: canManage,
    staleTime: 60_000,
  });

  const create = useMutation({
    mutationFn: () => certificateOfAttendanceApi.create({
      ...form,
      employee_id: targetEmpId,
      claimed_time_in:  needIn  ? (form.claimed_time_in  || null) : null,
      claimed_time_out: needOut ? (form.claimed_time_out || null) : null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["coa-requests"] });
      setForm(blankForm());
      setOpen(false);
    },
  });

  const employee = meData?.user?.employee;
  const today = new Date().toLocaleDateString("en-PH", { month: "numeric", day: "numeric", year: "numeric" });

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-800">File certificate of attendance</p>
          <p className="text-xs text-slate-500">Use this when a punch was missed and you need to certify your actual time.</p>
        </div>
        <button onClick={() => setOpen((v) => !v)} className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800">
          {open ? "Cancel" : "+ File COA"}
        </button>
      </div>

      {open && (
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="border-t border-slate-200">
          <div className="border-b border-slate-100 px-6 py-4">
            <h3 className="text-lg font-bold text-slate-800">Certificate of Attendance Form</h3>
          </div>

          <div className="flex flex-col lg:flex-row">
            {/* Left: employee info */}
            <div className="w-full shrink-0 space-y-3 border-b border-slate-100 px-6 py-5 lg:w-52 lg:border-b-0 lg:border-r">
              {canManage && (
                <div className="mb-3">
                  <label className="mb-1 block text-xs font-medium text-slate-500">Employee</label>
                  <select
                    className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-green-500"
                    value={adminEmployeeId}
                    onChange={(e) => setAdminEmployeeId(Number(e.target.value))}
                  >
                    <option value="">Select…</option>
                    {empPage?.data.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                  </select>
                </div>
              )}
              <InfoRow label="Name" value={employee?.full_name ?? "—"} />
              <InfoRow label="Position" value={employee?.position ?? "—"} />
              <InfoRow label="Account / Department" value={employee?.department ?? "—"} />
              <InfoRow label="Date Filed" value={today} />
            </div>

            {/* Right: form fields */}
            <div className="flex-1 space-y-5 px-6 py-5">
              <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm text-slate-700">Work Date:</label>
                  <input type="date" className={inputCls} value={form.work_date}
                    onChange={(e) => setForm({ ...form, work_date: e.target.value })} required />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-slate-700">Missed Punch:</label>
                  <select className={inputCls} value={form.missed_punch}
                    onChange={(e) => setForm({ ...form, missed_punch: e.target.value as CertificateOfAttendanceInput["missed_punch"] })}>
                    <option value="in">Time In</option>
                    <option value="out">Time Out</option>
                    <option value="both">Both</option>
                  </select>
                </div>
                <div className="hidden sm:block" />
                {needIn && (
                  <div>
                    <label className="mb-1 block text-sm text-slate-700">Claimed Time In:</label>
                    <input type="time" className={inputCls} value={form.claimed_time_in ?? ""}
                      onChange={(e) => setForm({ ...form, claimed_time_in: e.target.value })} required />
                  </div>
                )}
                {needOut && (
                  <div>
                    <label className="mb-1 block text-sm text-slate-700">Claimed Time Out:</label>
                    <input type="time" className={inputCls} value={form.claimed_time_out ?? ""}
                      onChange={(e) => setForm({ ...form, claimed_time_out: e.target.value })} required />
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm text-slate-700">Reason:</label>
                <textarea className={inputCls} rows={3} value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })} required
                  placeholder="Why was the punch missed? (e.g. biometric error, field work, forgot to scan)" />
              </div>

              {create.isError && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">Failed to submit. Please check all required fields.</p>
              )}
            </div>
          </div>

          <div className="flex justify-end border-t border-slate-100 px-6 py-4">
            <button type="submit" disabled={create.isPending}
              className="rounded-lg bg-slate-900 px-8 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
              {create.isPending ? "Submitting…" : "Submit"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-sm">
      <span className="text-slate-700">{label}: </span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  );
}

// ── Approver row ──────────────────────────────────────────────────────────

function ApproverRow({ request: r, onDone }: { request: CertificateOfAttendanceRequest; onDone: () => void }) {
  const [remarks, setRemarks] = useState("");
  const [acting, setActing] = useState<"approve" | "reject" | null>(null);

  const approve = useMutation({ mutationFn: () => certificateOfAttendanceApi.approve(r.id, remarks || undefined), onSuccess: onDone });
  const reject  = useMutation({ mutationFn: () => certificateOfAttendanceApi.reject(r.id, remarks || undefined), onSuccess: onDone });

  return (
    <>
      <tr className="hover:bg-slate-50/60">
        <td className="px-4 py-3">
          <span className="font-medium text-slate-800">{r.employee?.full_name ?? `#${r.employee_id}`}</span>
          <p className="text-xs text-slate-500">{r.employee?.employee_no}</p>
        </td>
        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{fmt(r.work_date)}</td>
        <td className="px-4 py-3 text-xs text-slate-600">{MISSED_LABEL[r.missed_punch]}</td>
        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600">{to12h(r.claimed_time_in)} / {to12h(r.claimed_time_out)}</td>
        <td className="max-w-xs px-4 py-3"><span className="line-clamp-2 text-xs text-slate-600">{r.reason}</span></td>
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

// ── My history ────────────────────────────────────────────────────────────

function MyHistory({ requests, isLoading }: { requests: CertificateOfAttendanceRequest[]; isLoading: boolean }) {
  const qc = useQueryClient();
  const cancel = useMutation({
    mutationFn: (id: number) => certificateOfAttendanceApi.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["coa-requests"] }),
  });

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>;
  if (requests.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-400">
        No certificate-of-attendance requests yet. File one above.
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-700">My requests</h3>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 text-left">Work Date</th>
              <th className="px-4 py-3 text-left">Missed</th>
              <th className="px-4 py-3 text-left">Claimed In/Out</th>
              <th className="px-4 py-3 text-left">Reason</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {requests.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/60">
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{fmt(r.work_date)}</td>
                <td className="px-4 py-3 text-xs text-slate-600">{MISSED_LABEL[r.missed_punch]}</td>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600">{to12h(r.claimed_time_in)} / {to12h(r.claimed_time_out)}</td>
                <td className="max-w-xs px-4 py-3"><span className="line-clamp-2 text-xs text-slate-600">{r.reason}</span></td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                </td>
                <td className="px-4 py-3">
                  {r.status === "pending" && (
                    <button onClick={() => cancel.mutate(r.id)} disabled={cancel.isPending}
                      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50">Cancel</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
