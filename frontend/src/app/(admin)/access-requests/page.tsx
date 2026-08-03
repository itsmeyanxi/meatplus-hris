"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { getMe } from "@/lib/auth";
import {
  decideAccessRequest,
  getAccessRequests,
  getAccessRequestStats,
  type AccessRequest,
  type AccessRequestStatus,
} from "@/lib/access-requests";
import { AppCard, PageHeader, TableShell } from "@/components/ui";
import { inputCls } from "@/lib/form-classes";

// ── Constants ─────────────────────────────────────────────────────────────

const VIEW_PERMISSION = "access_request.view";

const STAGE_PERMISSION: Record<string, string> = {
  supervisor: "access_request.approve.supervisor",
  hr:         "access_request.approve.hr",
  it:         "access_request.approve.it",
};

const STAGES = ["supervisor", "hr", "it"] as const;
type Stage = (typeof STAGES)[number];

const STAGE_LABEL: Record<Stage, string> = {
  supervisor: "Supervisor",
  hr:         "HR",
  it:         "IT",
};

// ── Helpers ───────────────────────────────────────────────────────────────

function humanize(value: string): string {
  const s = value.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtDate(raw: string | null | undefined): string {
  if (!raw) return "—";
  return new Date(raw).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

// ── Sub-components ────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AccessRequest["status"] }) {
  const cfg: Record<string, { bg: string; text: string; dot: string }> = {
    pending:   { bg: "bg-amber-50",   text: "text-amber-800",   dot: "bg-amber-400" },
    approved:  { bg: "bg-emerald-50", text: "text-emerald-800", dot: "bg-emerald-500" },
    rejected:  { bg: "bg-red-50",     text: "text-red-700",     dot: "bg-red-400" },
    cancelled: { bg: "bg-slate-100",  text: "text-slate-600",   dot: "bg-slate-400" },
  };
  const c = cfg[status] ?? cfg.cancelled;
  const label = status === "rejected" ? "Disapproved" : humanize(status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${c.bg} ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {label}
    </span>
  );
}

function StagePipeline({ current, status }: { current: string; status: AccessRequest["status"] }) {
  if (status !== "pending") {
    return <StatusBadge status={status} />;
  }
  const currentIdx = STAGES.indexOf(current as Stage);
  return (
    <div className="flex items-center gap-1">
      {STAGES.map((s, i) => {
        const done   = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={s} className="flex items-center gap-1">
            <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
              done   ? "bg-emerald-100 text-emerald-700" :
              active ? "bg-amber-100 text-amber-800 ring-1 ring-amber-300" :
                       "bg-slate-100 text-slate-400"
            }`}>
              {STAGE_LABEL[s]}
            </span>
            {i < 2 && <span className="text-slate-200 text-[10px]">›</span>}
          </div>
        );
      })}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function AccessRequestsPage() {
  const queryClient = useQueryClient();
  const { data: me, isLoading: meLoading } = useQuery({ queryKey: ["me"], queryFn: getMe });

  const perms = me?.user.permissions ?? [];
  const canView = perms.includes(VIEW_PERMISSION);
  const canActOnStage = (stage: string) =>
    Boolean(STAGE_PERMISSION[stage]) && perms.includes(STAGE_PERMISSION[stage]);

  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectRemarks, setRejectRemarks] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | AccessRequest["status"]>("all");
  const [page, setPage] = useState(1);

  const { data: stats } = useQuery({
    queryKey: ["access-requests", "stats"],
    queryFn: getAccessRequestStats,
    enabled: canView,
  });

  const { data: requestsResult, isLoading: listLoading } = useQuery({
    queryKey: ["access-requests", "list", page],
    queryFn: () => getAccessRequests({ page }),
    enabled: canView,
  });
  const requests = requestsResult?.data ?? [];
  const requestsMeta = requestsResult?.meta;

  const approve = useMutation({
    mutationFn: (id: number) => decideAccessRequest(id, "approve"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["access-requests"] }),
  });

  const reject = useMutation({
    mutationFn: ({ id, remarks }: { id: number; remarks: string }) =>
      decideAccessRequest(id, "reject", remarks || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["access-requests"] });
      setRejectingId(null);
      setRejectRemarks("");
    },
  });

  if (meLoading) return <p className="p-8 text-sm text-slate-500">Loading…</p>;

  if (!canView) {
    return (
      <AppCard className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-600">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-slate-900">Access denied</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
          You don&apos;t have permission to view access requests.
        </p>
        <Link href="/dashboard" className="mt-6 inline-flex rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700">
          Back to dashboard
        </Link>
      </AppCard>
    );
  }

  const totals = stats?.totals ?? { total: 0, pending: 0, approved: 0, disapproved: 0 };

  const filteredRequests = statusFilter === "all"
    ? requests
    : requests.filter((r) => r.status === statusFilter);

  const STATUS_TABS: { value: "all" | AccessRequestStatus; label: string }[] = [
    { value: "all",       label: "All" },
    { value: "pending",   label: "Pending" },
    { value: "approved",  label: "Approved" },
    { value: "rejected",  label: "Disapproved" },
    { value: "cancelled", label: "Cancelled" },
  ];

  const statCards = [
    { label: "Total",       value: totals.total,       rail: "bg-slate-300"   },
    { label: "Pending",     value: totals.pending,     rail: "bg-amber-400"   },
    { label: "Approved",    value: totals.approved,    rail: "bg-emerald-500" },
    { label: "Disapproved", value: totals.disapproved, rail: "bg-red-500"     },
  ];

  const queueCards = STAGES
    .filter((s) => canActOnStage(s))
    .map((s) => ({
      stage:   s,
      label:   STAGE_LABEL[s],
      pending: stats?.queues?.[s] ?? 0,
    }));

  const COL_SPAN = 5;

  return (
    <div className="space-y-7">
      <PageHeader
        title="Access Requests"
        description="Review system access requests routed through supervisor → HR → IT approval."
      />

      {/* ── Summary stats ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map((card) => (
          <div key={card.label} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
            <div className={`absolute inset-y-0 left-0 w-1 ${card.rail}`} />
            <div className="pl-5 pr-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{card.label}</p>
              <p className="mt-1.5 text-3xl font-bold tracking-tight text-slate-900 tabular-nums">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Approver queues ── */}
      {queueCards.length > 0 && (
        <div>
          <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span className="h-px flex-1 bg-slate-200" />
            Your approval queues
            <span className="h-px flex-1 bg-slate-200" />
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {queueCards.map((q) => (
              <div key={q.stage} className={`flex items-center justify-between rounded-2xl border px-5 py-4 shadow-sm ${
                q.pending > 0
                  ? "border-amber-200 bg-amber-50"
                  : "border-slate-200 bg-white"
              }`}>
                <div>
                  <p className={`text-xs font-semibold uppercase tracking-wide ${q.pending > 0 ? "text-amber-700" : "text-slate-400"}`}>
                    {q.label} queue
                  </p>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className={`text-2xl font-bold tabular-nums ${q.pending > 0 ? "text-amber-900" : "text-slate-700"}`}>{q.pending}</span>
                    <span className={`text-xs ${q.pending > 0 ? "text-amber-700" : "text-slate-400"}`}>pending</span>
                  </div>
                </div>
                {q.pending > 0 && (
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-400/25">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Status filter tabs ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => { setStatusFilter(tab.value); setPage(1); }}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                statusFilter === tab.value
                  ? "bg-brand-600 text-white shadow-sm"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {requestsMeta && requestsMeta.last_page > 1 && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-40"
            >
              Prev
            </button>
            <span className="text-xs text-slate-500">{page} / {requestsMeta.last_page}</span>
            <button
              disabled={page >= requestsMeta.last_page}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* ── Request list ── */}
      {requestsMeta && (
        <p className="text-xs text-slate-400">
          Showing {requests.length} of {requestsMeta.total} total (page {requestsMeta.current_page} of {requestsMeta.last_page})
        </p>
      )}
      <TableShell>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Requester</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Request type</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Approval stage</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Date filed</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {listLoading ? (
              <tr><td colSpan={COL_SPAN} className="px-4 py-16 text-center text-sm text-slate-400">Loading…</td></tr>
            ) : filteredRequests.length === 0 ? (
              <tr>
                <td colSpan={COL_SPAN} className="px-4 py-20 text-center">
                  <p className="text-sm font-medium text-slate-700">No access requests{statusFilter !== "all" ? ` with status "${statusFilter}"` : " yet"}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{statusFilter !== "all" ? "Try a different filter." : "Submitted requests will appear here for review."}</p>
                </td>
              </tr>
            ) : (
              filteredRequests.map((r) => (
                <>
                  <tr key={r.id} className={`border-t border-slate-100 transition hover:bg-slate-50/70 ${rejectingId === r.id ? "bg-red-50/40" : ""}`}>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-slate-800">{r.employee_name}</p>
                      <p className="text-xs text-slate-400">{r.department} · {r.position ?? r.employee_id_number}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                        {humanize(r.request_type)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <StagePipeline current={r.current_stage} status={r.status} />
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-500 tabular-nums">
                      {fmtDate(r.submitted_at)}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/access-requests/${r.id}`}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
                        >
                          View
                        </Link>
                        {r.status === "pending" && canActOnStage(r.current_stage) && (
                          <>
                            <button
                              type="button"
                              disabled={approve.isPending}
                              onClick={() => approve.mutate(r.id)}
                              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectingId(rejectingId === r.id ? null : r.id);
                                setRejectRemarks("");
                              }}
                              className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {r.status === "pending" && !canActOnStage(r.current_stage) && (
                          <span className="text-[11px] text-slate-400">
                            Awaiting {STAGE_LABEL[r.current_stage as Stage] ?? humanize(r.current_stage)}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Reject inline row */}
                  {rejectingId === r.id && (
                    <tr key={`${r.id}-reject`} className="border-t border-red-100 bg-red-50/50">
                      <td colSpan={COL_SPAN} className="px-4 py-3">
                        <div className="flex items-end gap-3">
                          <div className="shrink-0 flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-100 px-2.5 py-1.5 text-xs font-semibold text-red-700">
                            Rejecting: {r.employee_name}
                          </div>
                          <div className="flex-1">
                            <label className="mb-1 block text-xs font-medium text-red-700">Rejection reason (optional)</label>
                            <input
                              type="text"
                              className={`${inputCls} border-red-200 focus:border-red-400 focus:ring-red-200`}
                              placeholder="Explain why this request is being rejected…"
                              value={rejectRemarks}
                              onChange={(e) => setRejectRemarks(e.target.value)}
                              autoFocus
                            />
                          </div>
                          <button
                            onClick={() => reject.mutate({ id: r.id, remarks: rejectRemarks })}
                            disabled={reject.isPending}
                            className="shrink-0 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
                          >
                            {reject.isPending ? "Rejecting…" : "Confirm reject"}
                          </button>
                          <button
                            onClick={() => setRejectingId(null)}
                            className="shrink-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}
