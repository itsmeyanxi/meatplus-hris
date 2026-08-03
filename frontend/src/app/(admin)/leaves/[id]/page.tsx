"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { StatusPill } from "@/components/approvals/StatusPill";
import { AppCard, PageHeader } from "@/components/ui";
import { getMe } from "@/lib/auth";
import { leaveAppsApi } from "@/lib/leaves";
import { inputCls, labelCls } from "@/lib/form-classes";

export default function LeaveDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const id = Number(params.id);

  const [rejectRemarks, setRejectRemarks] = useState("");
  const [approveRemarks, setApproveRemarks] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const canApprove =
    (me?.user.permissions.includes("leave.approve.any") ||
      me?.user.permissions.includes("leave.approve.self_dept")) ??
    false;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["leave-app", id],
    queryFn: () => leaveAppsApi.get(id),
    enabled: Number.isFinite(id),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["leave-app", id] });
    qc.invalidateQueries({ queryKey: ["leave-apps"] });
    qc.invalidateQueries({ queryKey: ["leave-balances"] });
  };

  const approve = useMutation({
    mutationFn: () => leaveAppsApi.approve(id, approveRemarks || undefined),
    onSuccess: invalidate,
  });

  const reject = useMutation({
    mutationFn: () => leaveAppsApi.reject(id, rejectRemarks || undefined),
    onSuccess: () => { invalidate(); setShowRejectForm(false); },
  });

  const cancel = useMutation({
    mutationFn: () => leaveAppsApi.cancel(id),
    onSuccess: () => { invalidate(); router.back(); },
  });

  const notifySup = useMutation({
    mutationFn: () => leaveAppsApi.notifySupervisor(id),
  });

  if (isLoading) {
    return <div className="p-8 text-center text-slate-500">Loading leave application…</div>;
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Leave application not found</h2>
        <p className="mt-1 text-sm text-slate-500">It may have been removed or you don&apos;t have access.</p>
        <Link href="/leaves" className="mt-6 inline-flex rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700">
          Back to leaves
        </Link>
      </div>
    );
  }

  const isPending = data.status === "pending";
  const canCancel = data.status === "pending" || data.status === "approved";
  const showApprovalActions = canApprove && isPending;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Leave Application"
        description={`${data.leave_type.code} — ${data.leave_type.name}`}
        actions={
          <button
            onClick={() => router.back()}
            className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            ← Back
          </button>
        }
      />

      <AppCard title="Status">
        <StatusPill status={data.status} />
      </AppCard>

      <AppCard title="Details">
        <div className="space-y-4">
          {data.employee && (
            <Detail label="Employee">
              <span className="font-medium text-slate-900">{data.employee.full_name}</span>
              <span className="ml-2 font-mono text-xs text-slate-400">{data.employee.employee_no}</span>
            </Detail>
          )}
          <Detail label="Leave type">
            <span className="font-mono text-xs text-slate-500">{data.leave_type.code}</span>
            <span className="ml-2">{data.leave_type.name}</span>
          </Detail>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Detail label="From">{data.date_from}</Detail>
            <Detail label="To">{data.date_to}</Detail>
            <Detail label="Days">{data.days_count}</Detail>
            <Detail label="Half day">{data.half_day ? data.half_day.toUpperCase() : "—"}</Detail>
          </div>
          <Detail label="Reason">
            <p className="whitespace-pre-wrap text-slate-700">{data.reason || "—"}</p>
          </Detail>
          <Detail label="Supporting document">
            {data.attachment_path ? (
              <a
                href={leaveAppsApi.attachmentUrl(id)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition"
              >
                <svg className="h-3.5 w-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                </svg>
                Download / View file
              </a>
            ) : (
              <span className="text-slate-400">No attachment</span>
            )}
          </Detail>
        </div>
      </AppCard>

      {/* Approval actions — only shown to approvers when leave is pending */}
      {isPending && (
        <AppCard title="Route to supervisor">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => notifySup.mutate()}
              disabled={notifySup.isPending}
              className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:opacity-60"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {notifySup.isPending ? "Notifying…" : "Notify supervisor"}
            </button>
            {notifySup.isSuccess && <span className="text-sm text-emerald-700">{notifySup.data.message}</span>}
            {notifySup.isError && (
              <span className="text-sm text-red-600">
                {(notifySup.error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to notify."}
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500">Sends the employee&rsquo;s dedicated supervisor a notification to review this leave — so the right person approves it.</p>
        </AppCard>
      )}

      {showApprovalActions && (
        <AppCard title="Decision">
          {!showRejectForm ? (
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Approval remarks (optional)</label>
                <textarea
                  className={`${inputCls} resize-y`}
                  rows={2}
                  placeholder="Any notes for the employee…"
                  value={approveRemarks}
                  onChange={(e) => setApproveRemarks(e.target.value)}
                />
              </div>
              {approve.isError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {(approve.error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to approve."}
                </p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => approve.mutate()}
                  disabled={approve.isPending}
                  className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  {approve.isPending ? "Approving…" : "Approve"}
                </button>
                <button
                  onClick={() => setShowRejectForm(true)}
                  className="rounded-xl border border-red-200 bg-red-50 px-5 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                >
                  Reject
                </button>
                {canCancel && (
                  <button
                    onClick={() => {
                      if (window.confirm("Cancel this leave application? This cannot be undone.")) {
                        cancel.mutate();
                      }
                    }}
                    disabled={cancel.isPending}
                    className="ml-auto rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    {cancel.isPending ? "Cancelling…" : "Cancel leave"}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Rejection reason *</label>
                <textarea
                  className={`${inputCls} resize-y`}
                  rows={3}
                  placeholder="Explain the reason for rejection…"
                  value={rejectRemarks}
                  onChange={(e) => setRejectRemarks(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              {reject.isError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {(reject.error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to reject."}
                </p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => reject.mutate()}
                  disabled={reject.isPending || !rejectRemarks.trim()}
                  className="rounded-xl bg-red-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
                >
                  {reject.isPending ? "Rejecting…" : "Confirm rejection"}
                </button>
                <button
                  onClick={() => setShowRejectForm(false)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </AppCard>
      )}

      {/* Cancel action for non-approvers (employee cancelling their own) */}
      {!showApprovalActions && canCancel && (
        <div className="flex justify-end">
          <button
            onClick={() => {
              if (window.confirm("Cancel this leave application? This cannot be undone.")) {
                cancel.mutate();
              }
            }}
            disabled={cancel.isPending}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
          >
            {cancel.isPending ? "Cancelling…" : "Cancel this leave"}
          </button>
        </div>
      )}

      <AppCard title="Decision record">
        <div className="space-y-4">
          <Detail label="Decided by">{data.approved_by?.name ?? "—"}</Detail>
          <Detail label="Decided at">
            {data.decided_at ? new Date(data.decided_at).toLocaleString() : "—"}
          </Detail>
          <Detail label="Decision remarks">
            <p className="whitespace-pre-wrap text-slate-700">{data.decision_remarks || "—"}</p>
          </Detail>
        </div>
      </AppCard>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <div className="mt-1 text-sm text-slate-800">{children}</div>
    </div>
  );
}
