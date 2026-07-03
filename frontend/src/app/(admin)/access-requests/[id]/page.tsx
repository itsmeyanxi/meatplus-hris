"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getMe } from "@/lib/auth";
import {
  decideAccessRequest,
  getAccessRequest,
  type AccessRequest,
  type AccessRequestApproval,
} from "@/lib/access-requests";
import { AppCard, PageHeader } from "@/components/ui";
import { inputCls, labelCls } from "@/lib/form-classes";

function humanize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const STAGE_PERMISSION: Record<string, string> = {
  supervisor: "access_request.approve.supervisor",
  hr: "access_request.approve.hr",
  it: "access_request.approve.it",
};

const STAGE_LABEL: Record<string, string> = {
  supervisor: "Supervisor",
  hr: "HR",
  it: "IT",
};

function StatusBadge({ status }: { status: AccessRequest["status"] }) {
  const map: Record<string, string> = {
    pending:   "bg-amber-100 text-amber-800",
    approved:  "bg-emerald-100 text-emerald-800",
    rejected:  "bg-red-100 text-red-700",
    cancelled: "bg-slate-100 text-slate-600",
  };
  const label = status === "rejected" ? "Disapproved" : humanize(status);
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${map[status] ?? "bg-slate-100 text-slate-700"}`}>
      {label}
    </span>
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

function ApprovalStageRow({ approval, stage }: { approval?: AccessRequestApproval; stage: string }) {
  const statusColor: Record<string, string> = {
    pending:  "bg-amber-100 text-amber-800",
    approved: "bg-emerald-100 text-emerald-800",
    rejected: "bg-red-100 text-red-700",
  };
  const dotColor: Record<string, string> = {
    pending:  "bg-amber-400",
    approved: "bg-emerald-500",
    rejected: "bg-red-500",
  };
  const status = approval?.status ?? "pending";
  return (
    <div className="flex items-start gap-4">
      <div className="flex flex-col items-center">
        <span className={`mt-1 h-3 w-3 rounded-full shrink-0 ${dotColor[status] ?? "bg-slate-300"}`} />
      </div>
      <div className="flex-1 min-w-0 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">{STAGE_LABEL[stage] ?? humanize(stage)}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[status] ?? "bg-slate-100 text-slate-600"}`}>
            {status === "rejected" ? "Disapproved" : humanize(status)}
          </span>
        </div>
        {approval?.decided_by && (
          <p className="mt-0.5 text-xs text-slate-500">
            {approval.decided_by.name}
            {approval.decided_at && (
              <> · {new Date(approval.decided_at).toLocaleString()}</>
            )}
          </p>
        )}
        {approval?.remarks && (
          <p className="mt-1 text-xs italic text-slate-500">&ldquo;{approval.remarks}&rdquo;</p>
        )}
      </div>
    </div>
  );
}

export default function AccessRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const id = Number(params.id);

  const [approveRemarks, setApproveRemarks] = useState("");
  const [rejectRemarks, setRejectRemarks] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const perms = me?.user.permissions ?? [];
  const canActOnStage = (stage: string) =>
    Boolean(STAGE_PERMISSION[stage]) && perms.includes(STAGE_PERMISSION[stage]);

  const { data: request, isLoading, isError } = useQuery({
    queryKey: ["access-request", id],
    queryFn: () => getAccessRequest(id),
    enabled: Number.isFinite(id),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["access-request", id] });
    qc.invalidateQueries({ queryKey: ["access-requests"] });
  };

  const approve = useMutation({
    mutationFn: () => decideAccessRequest(id, "approve", approveRemarks || undefined),
    onSuccess: invalidate,
  });

  const reject = useMutation({
    mutationFn: () => decideAccessRequest(id, "reject", rejectRemarks || undefined),
    onSuccess: () => { invalidate(); setShowRejectForm(false); },
  });

  if (isLoading) return <div className="p-8 text-center text-sm text-slate-500">Loading…</div>;

  if (isError || !request) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Request not found</h2>
        <p className="mt-1 text-sm text-slate-500">It may have been removed or you don&apos;t have access.</p>
        <Link href="/access-requests" className="mt-6 inline-flex rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800">
          Back to queue
        </Link>
      </div>
    );
  }

  const isPending = request.status === "pending";
  const canAct = isPending && canActOnStage(request.current_stage);
  const stages: Array<"supervisor" | "hr" | "it"> = ["supervisor", "hr", "it"];

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Access Request"
        description={`${humanize(request.request_type)} · ${request.employee_name}`}
        actions={
          <button
            onClick={() => router.back()}
            className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            ← Back
          </button>
        }
      />

      {/* Status */}
      <AppCard title="Status">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={request.status} />
          {isPending && (
            <span className="text-sm text-slate-500">
              Awaiting <strong>{STAGE_LABEL[request.current_stage] ?? humanize(request.current_stage)}</strong> approval
            </span>
          )}
        </div>
      </AppCard>

      {/* Request details */}
      <AppCard title="Request Details">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Detail label="Request type">{humanize(request.request_type)}</Detail>
          <Detail label="Effective date">{request.effective_date}</Detail>
          {request.ticket_number && <Detail label="Ticket number">{request.ticket_number}</Detail>}
          <Detail label="Submitted">{request.submitted_at ? new Date(request.submitted_at).toLocaleString() : "—"}</Detail>
        </div>
      </AppCard>

      {/* Employee info */}
      <AppCard title="Employee Information">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Detail label="Full name">{request.employee_name}</Detail>
          <Detail label="Employee ID">{request.employee_id_number}</Detail>
          <Detail label="Position">{request.position}</Detail>
          <Detail label="Department">{request.department}</Detail>
          <Detail label="Employment status">{humanize(request.employment_status)}</Detail>
          <Detail label="Immediate supervisor">{request.immediate_supervisor}</Detail>
          <Detail label="Company email">{request.company_email}</Detail>
          <Detail label="Contact number">{request.contact_number}</Detail>
        </div>
      </AppCard>

      {/* Module access */}
      {request.modules && request.modules.length > 0 && (
        <AppCard title="Requested Module Access">
          <div className="divide-y divide-slate-100">
            {request.modules.map((m) => (
              <div key={m.module} className="flex items-center justify-between py-2.5">
                <span className="text-sm font-medium text-slate-800">{humanize(m.module)}</span>
                <div className="flex flex-wrap justify-end gap-1.5">
                  {m.levels.map((l) => (
                    <span key={l} className="rounded-md bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-sky-200">
                      {humanize(l)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </AppCard>
      )}

      {/* Justification */}
      <AppCard title="Justification">
        <p className="whitespace-pre-wrap text-sm text-slate-700">{request.justification || "—"}</p>
      </AppCard>

      {/* Decision actions */}
      {canAct && (
        <AppCard title="Decision">
          {!showRejectForm ? (
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Approval remarks (optional)</label>
                <textarea
                  className={`${inputCls} resize-y`}
                  rows={2}
                  placeholder="Any notes for the requester…"
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

      {/* Approval chain */}
      <AppCard title="Approval Chain">
        <div className="space-y-0 divide-y divide-transparent">
          {stages.map((stage, i) => {
            const approval = request.approvals?.find((a) => a.stage === stage);
            const isCurrentStage = isPending && request.current_stage === stage;
            return (
              <div key={stage} className={`relative ${i < stages.length - 1 ? "before:absolute before:left-[5px] before:top-4 before:h-full before:w-px before:bg-slate-200" : ""}`}>
                <ApprovalStageRow
                  stage={stage}
                  approval={
                    approval ?? (
                      isCurrentStage
                        ? ({ stage, sequence: i + 1, status: "pending", decided_at: null, remarks: null, decided_by: null } as AccessRequestApproval)
                        : undefined
                    )
                  }
                />
              </div>
            );
          })}
        </div>
      </AppCard>
    </div>
  );
}
