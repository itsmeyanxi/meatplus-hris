"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getMe } from "@/lib/auth";
import { listEmployees } from "@/lib/employees";
import {
  employeeSchedulesApi,
  schedAdjApi,
  type ScheduleAdjustmentReq,
  type ScheduleAdjustmentReqInput,
  type SchedAdjStatus,
} from "@/lib/attendance";

// ── helpers ───────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-PH", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function to12h(t: string | null): string {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

const inputCls = "w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100";

type Tab = "pending" | "approved" | "rejected";

const TABS: { key: Tab; label: string }[] = [
  { key: "pending",  label: "Pending / Resubmitted for Editing" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected / Cancelled" },
];

// ── page ──────────────────────────────────────────────────────────────────

export default function ScheduleAdjustmentsPage() {
  const qc = useQueryClient();
  const { data: meData, isLoading: meLoading } = useQuery({ queryKey: ["me"], queryFn: getMe });

  const user      = meData?.user;
  const perms     = user?.permissions ?? [];
  const isHR      = perms.includes("attendance.view.any") || perms.includes("attendance.manage");
  const canApprove = perms.includes("attendance.approve.any") || perms.includes("attendance.approve.self_dept") || perms.includes("attendance.manage");
  const canManage = perms.includes("attendance.manage");
  const employeeId = user?.employee?.id ?? null;

  const [tab, setTab]     = useState<Tab>("pending");
  const [showForm, setShowForm] = useState(false);
  const [page, setPage] = useState(1);

  const handleTabChange = (t: Tab) => { setTab(t); setPage(1); };

  // HR picks an employee to view; employees see own
  const [viewEmpId, setViewEmpId] = useState<number | null>(null);
  const targetEmpId = isHR ? (viewEmpId ?? null) : employeeId;

  const { data: empPage } = useQuery({
    queryKey: ["employees", { all: true }],
    queryFn: () => listEmployees({ perPage: 200 }),
    enabled: isHR,
    staleTime: 60_000,
  });

  const statusParam = tab === "pending" ? "pending_or_resubmitted" : tab === "rejected" ? "rejected" : "approved";

  const { data: requestsResult, isLoading } = useQuery({
    queryKey: ["sched-adj-requests", tab, targetEmpId, page],
    queryFn: () => schedAdjApi.list({
      status: statusParam,
      ...(targetEmpId ? { employee_id: targetEmpId } : {}),
      page,
    }),
    enabled: !!employeeId || isHR,
    staleTime: 30_000,
  });
  const requests = requestsResult?.data ?? [];
  const schedMeta = requestsResult?.meta;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">Schedule Adjustments</h2>
        {(meLoading || employeeId || canManage) && (
          <button
            onClick={() => setShowForm((v) => !v)}
            disabled={meLoading}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${
              showForm
                ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                : "bg-green-600 text-white hover:bg-green-700"
            }`}
          >
            {showForm ? (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Close
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                New Request
              </>
            )}
          </button>
        )}
      </div>

      {/* Application form (slide in) */}
      {showForm && !meLoading && (employeeId || canManage) && (
        <ApplicationForm
          employeeId={employeeId ?? 0}
          canManage={canManage}
          empPage={empPage?.data ?? []}
          onSuccess={() => {
            setShowForm(false);
            qc.invalidateQueries({ queryKey: ["sched-adj-requests"] });
          }}
        />
      )}

      {/* HR employee filter */}
      {isHR && empPage && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">Filter by employee:</span>
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-teal-500 min-w-[200px]"
            value={viewEmpId ?? ""}
            onChange={(e) => setViewEmpId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">All employees</option>
            {empPage.data.map((e) => (
              <option key={e.id} value={e.id}>{e.full_name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Tabs + table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-slate-200">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => handleTabChange(t.key)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? "border-green-600 text-green-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-500">
              {isHR && <th className="px-5 py-3 text-left">Employee</th>}
              <th className="px-5 py-3 text-left">Status</th>
              <th className="px-5 py-3 text-left">Reason</th>
              <th className="px-5 py-3 text-left">Date Filed</th>
              <th className="px-5 py-3 text-left">Date Range</th>
              <th className="px-5 py-3 text-left">Shift</th>
              <th className="px-5 py-3 text-left"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-400">Loading…</td></tr>
            ) : requests.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-400">No requests in this category.</td></tr>
            ) : (
              requests.map((r) => (
                <RequestRow key={r.id} req={r} isHR={isHR} canApprove={canApprove} employeeId={employeeId} />
              ))
            )}
          </tbody>
        </table>

        {/* Pagination footer */}
        {schedMeta && schedMeta.last_page > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
            <p className="text-xs text-slate-400">
              {requests.length} of {schedMeta.total} total (page {schedMeta.current_page} of {schedMeta.last_page})
            </p>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded border border-slate-200 px-3 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-40"
              >
                Prev
              </button>
              <span className="text-xs text-slate-500">{page} / {schedMeta.last_page}</span>
              <button
                disabled={page >= schedMeta.last_page}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border border-slate-200 px-3 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Request row ───────────────────────────────────────────────────────────

function RequestRow({
  req: r,
  isHR,
  canApprove,
  employeeId,
}: {
  req: ScheduleAdjustmentReq;
  isHR: boolean;
  canApprove: boolean;
  employeeId: number | null;
}) {
  const qc = useQueryClient();
  const [acting, setActing] = useState<"approve" | "reject" | null>(null);
  const [remarks, setRemarks] = useState("");

  const approve = useMutation({
    mutationFn: () => schedAdjApi.approve(r.id, remarks || undefined),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sched-adj-requests"] }); setActing(null); },
  });
  const reject = useMutation({
    mutationFn: () => schedAdjApi.reject(r.id, remarks || undefined),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sched-adj-requests"] }); setActing(null); },
  });
  const cancel = useMutation({
    mutationFn: () => schedAdjApi.cancel(r.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sched-adj-requests"] }),
  });

  const isOwn = r.employee_id === employeeId;

  return (
    <>
      <tr className="hover:bg-slate-50/60">
        {isHR && (
          <td className="px-5 py-3 text-xs font-medium text-slate-700">
            {r.employee?.full_name ?? `#${r.employee_id}`}
          </td>
        )}
        <td className="px-5 py-3">
          <StatusBadge status={r.status} />
        </td>
        <td className="px-5 py-3 max-w-[180px]">
          <span className="line-clamp-2 text-xs text-slate-600">{r.reason ?? "—"}</span>
        </td>
        <td className="px-5 py-3 text-xs text-slate-600 whitespace-nowrap">
          {fmtDate(r.created_at.slice(0, 10))}
        </td>
        <td className="px-5 py-3 text-xs text-slate-600 whitespace-nowrap">
          {fmtDate(r.from_date)} – {fmtDate(r.to_date)}
        </td>
        <td className="px-5 py-3 text-xs text-slate-600 whitespace-nowrap">
          {to12h(r.shift_start)} – {to12h(r.shift_end)}
        </td>
        <td className="px-5 py-3">
          <div className="flex items-center gap-2">
            {canApprove && (r.status === "pending" || r.status === "resubmitted") && r.employee_id !== employeeId && (
              <>
                <button onClick={() => setActing("approve")} className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700">Approve</button>
                <button onClick={() => setActing("reject")} className="rounded border border-red-300 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">Reject</button>
              </>
            )}
            {isOwn && (r.status === "pending" || r.status === "resubmitted") && (
              <button onClick={() => cancel.mutate()} disabled={cancel.isPending} className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-50">Cancel</button>
            )}
          </div>
        </td>
      </tr>
      {acting && (
        <tr className="bg-slate-50/80">
          <td colSpan={isHR ? 7 : 6} className="px-5 pb-3 pt-1">
            <div className="flex items-center gap-2">
              <input
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-teal-500"
                placeholder={acting === "reject" ? "Rejection reason (required)…" : "Remarks (optional)…"}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
              <button
                disabled={approve.isPending || reject.isPending || (acting === "reject" && !remarks.trim())}
                onClick={() => acting === "approve" ? approve.mutate() : reject.mutate()}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 ${acting === "approve" ? "bg-emerald-600" : "bg-red-600"}`}
              >
                {approve.isPending || reject.isPending ? "Saving…" : acting === "approve" ? "Confirm" : "Confirm reject"}
              </button>
              <button onClick={() => { setActing(null); setRemarks(""); }} className="text-xs text-slate-400 hover:text-slate-700">Cancel</button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: SchedAdjStatus }) {
  const map: Record<SchedAdjStatus, string> = {
    pending:      "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    approved:     "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    rejected:     "bg-red-50 text-red-600 ring-1 ring-red-200",
    cancelled:    "bg-slate-100 text-slate-500",
    resubmitted:  "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  };
  const labels: Record<SchedAdjStatus, string> = {
    pending: "Pending", approved: "Approved", rejected: "Rejected", cancelled: "Cancelled", resubmitted: "Resubmitted",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${map[status]}`}>
      {labels[status]}
    </span>
  );
}

// ── Application form ──────────────────────────────────────────────────────

function ApplicationForm({
  employeeId,
  canManage,
  empPage,
  onSuccess,
}: {
  employeeId: number;
  canManage: boolean;
  empPage: { id: number; full_name: string }[];
  onSuccess: () => void;
}) {
  const [targetEmpId, setTargetEmpId] = useState(employeeId);

  const { data: assignments = [] } = useQuery({
    queryKey: ["schedule-assignments", targetEmpId],
    queryFn: () => employeeSchedulesApi.list(targetEmpId),
    staleTime: 60_000,
  });

  const currentSched = assignments[assignments.length - 1]?.work_schedule;

  const [form, setForm] = useState<ScheduleAdjustmentReqInput>({
    from_date: "", to_date: "", shift_start: "", break_start: "", break_end: "", shift_end: "", reason: "",
  });

  const create = useMutation({
    mutationFn: () => schedAdjApi.create({
      ...form,
      employee_id: canManage ? targetEmpId : undefined,
      break_start: form.break_start || null,
      break_end: form.break_end || null,
      reason: form.reason || null,
    }),
    onSuccess,
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Form header */}
      <div className="px-6 py-4 border-b border-slate-200">
        <h3 className="text-base font-semibold text-green-700">Schedule Adjustment Application Form</h3>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="px-6 py-5 space-y-6">

        {/* Employee selector (managers only) */}
        {canManage && (
          <div className="w-64">
            <label className="mb-1 block text-xs font-medium text-slate-500">Employee</label>
            <select className={inputCls} value={targetEmpId} onChange={(e) => setTargetEmpId(Number(e.target.value))}>
              {empPage.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          </div>
        )}

        {/* Work Schedule info */}
        <div>
          <h4 className="mb-3 text-base font-semibold text-slate-800">Work Schedule</h4>
          <div className="grid grid-cols-3 gap-6 text-sm">
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-0.5">Schedule Type</p>
              <p className="text-teal-700 font-medium">{currentSched?.name ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-0.5">Schedule Code</p>
              <p className="text-teal-700 font-medium">{currentSched?.code ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-0.5">Effective Since</p>
              <p className="text-slate-700">{assignments[assignments.length - 1]?.effective_from ? fmtDate(assignments[assignments.length - 1].effective_from) : "—"}</p>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100" />

        {/* Effectivity date */}
        <div>
          <h4 className="mb-3 text-base font-semibold text-slate-800">Effectivity Date</h4>
          <div className="flex flex-wrap gap-6">
            <div className="w-44">
              <label className="mb-1 block text-xs font-medium text-slate-500">From</label>
              <input type="date" className={inputCls} value={form.from_date} onChange={(e) => setForm({ ...form, from_date: e.target.value })} required />
            </div>
            <div className="w-44">
              <label className="mb-1 block text-xs font-medium text-slate-500">To</label>
              <input type="date" className={inputCls} value={form.to_date} onChange={(e) => setForm({ ...form, to_date: e.target.value })} required />
            </div>
          </div>
        </div>

        {/* Shift times */}
        <div className="flex flex-wrap gap-4 items-end">
          <div className="w-40">
            <label className="mb-1 block text-xs font-medium text-slate-500">Shift Start</label>
            <input type="time" className={inputCls} value={form.shift_start} onChange={(e) => setForm({ ...form, shift_start: e.target.value })} required />
          </div>
          <div className="w-40">
            <label className="mb-1 block text-xs font-medium text-slate-500">Break Start</label>
            <input type="time" className={inputCls} value={form.break_start ?? ""} onChange={(e) => setForm({ ...form, break_start: e.target.value })} />
          </div>
          <div className="w-40">
            <label className="mb-1 block text-xs font-medium text-slate-500">Break End</label>
            <input type="time" className={inputCls} value={form.break_end ?? ""} onChange={(e) => setForm({ ...form, break_end: e.target.value })} />
          </div>
          <div className="w-40">
            <label className="mb-1 block text-xs font-medium text-slate-500">Shift End</label>
            <input type="time" className={inputCls} value={form.shift_end} onChange={(e) => setForm({ ...form, shift_end: e.target.value })} required />
          </div>
        </div>

        {/* Reason */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Reason (optional)</label>
          <input type="text" className={inputCls} placeholder="e.g. Project deadline, special duty…" value={form.reason ?? ""} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </div>

        {create.isError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">Failed to submit. Check all required fields.</p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded-lg bg-teal-600 px-6 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
          >
            {create.isPending ? "Submitting…" : "Proceed"}
          </button>
        </div>
      </form>
    </div>
  );
}
