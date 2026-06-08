"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { getMe } from "@/lib/auth";
import {
  decideAccessRequest,
  getAccessRequests,
  getAccessRequestStats,
  type AccessRequest,
} from "@/lib/access-requests";
import { AppCard, PageHeader, TableShell } from "@/components/ui";

const VIEW_PERMISSION = "access_request.view";

// Which permission lets a user act on each stage.
const STAGE_PERMISSION: Record<string, string> = {
  supervisor: "access_request.approve.supervisor",
  hr: "access_request.approve.hr",
  it: "access_request.approve.it",
};

function humanize(value: string): string {
  const s = value.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function StatusBadge({ status }: { status: AccessRequest["status"] }) {
  const map: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800",
    approved: "bg-emerald-100 text-emerald-800",
    rejected: "bg-red-100 text-red-700",
  };
  const label = status === "rejected" ? "Disapproved" : humanize(status);
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${map[status] ?? "bg-slate-100 text-slate-700"}`}
    >
      {label}
    </span>
  );
}

export default function AccessRequestsPage() {
  const queryClient = useQueryClient();
  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
  });

  const perms = me?.user.permissions ?? [];
  const canView = perms.includes(VIEW_PERMISSION);
  const canActOnStage = (stage: string) =>
    Boolean(STAGE_PERMISSION[stage]) && perms.includes(STAGE_PERMISSION[stage]);

  const { data: stats } = useQuery({
    queryKey: ["access-requests", "stats"],
    queryFn: getAccessRequestStats,
    enabled: canView,
  });

  const { data: requests = [], isLoading: listLoading } = useQuery({
    queryKey: ["access-requests", "list"],
    queryFn: () => getAccessRequests(),
    enabled: canView,
  });

  const decide = useMutation({
    mutationFn: ({
      id,
      decision,
    }: {
      id: number;
      decision: "approve" | "reject";
    }) => decideAccessRequest(id, decision),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["access-requests"] });
    },
  });

  if (meLoading) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  if (!canView) {
    return (
      <AppCard className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="h-6 w-6"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 15v2m0-6a9 9 0 110 18 9 9 0 010-18zm0 0V9m-7.071 1.929a10 10 0 0114.142 0"
            />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-slate-900">Access denied</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
          You don&apos;t have permission to view access requests.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
        >
          Back to dashboard
        </Link>
      </AppCard>
    );
  }

  const totals = stats?.totals ?? {
    total: 0,
    pending: 0,
    approved: 0,
    disapproved: 0,
  };

  const statCards = [
    { label: "Total", value: totals.total, dot: "bg-slate-400" },
    { label: "Pending", value: totals.pending, dot: "bg-amber-400" },
    { label: "Approved", value: totals.approved, dot: "bg-emerald-500" },
    { label: "Disapproved", value: totals.disapproved, dot: "bg-red-500" },
  ];
  // Only show the queue(s) connected to this user's stage(s).
  const STAGE_QUEUE_LABEL: Record<string, string> = {
    supervisor: "Supervisor Queue",
    hr: "HR Queue",
    it: "IT Queue",
  };
  const queueCards = (["supervisor", "hr", "it"] as const)
    .filter((s) => canActOnStage(s))
    .map((s) => ({
      label: STAGE_QUEUE_LABEL[s],
      pending: stats?.queues?.[s] ?? 0,
    }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Access Requests"
        description="Review system access requests routed through supervisor → HR → IT approval."
      />

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur"
          >
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${card.dot}`} />
              <p className="text-xs font-medium text-slate-500">{card.label}</p>
            </div>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Approver queues */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Approver Queues
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {queueCards.map((q) => (
            <div
              key={q.label}
              className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur"
            >
              <p className="text-sm font-medium text-slate-700">{q.label}</p>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold text-slate-900">
                  {q.pending}
                </span>
                <span className="text-xs text-slate-500">pending</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <TableShell>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">
                Requester
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">
                Request type
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">
                Stage
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">
                Status
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">
                Submitted
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {listLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center text-sm text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : requests.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center">
                  <p className="text-sm font-medium text-slate-700">
                    No access requests yet
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Submitted requests will appear here for review.
                  </p>
                </td>
              </tr>
            ) : (
              requests.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-slate-100 transition hover:bg-slate-50/70"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{r.employee_name}</p>
                    <p className="text-xs text-slate-500">{r.department}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {humanize(r.request_type)}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {r.status === "pending" ? humanize(r.current_stage) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {r.submitted_at
                      ? new Date(r.submitted_at).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.status === "pending" && canActOnStage(r.current_stage) ? (
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={decide.isPending}
                          onClick={() =>
                            decide.mutate({ id: r.id, decision: "approve" })
                          }
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={decide.isPending}
                          onClick={() =>
                            decide.mutate({ id: r.id, decision: "reject" })
                          }
                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    ) : r.status === "pending" ? (
                      <span className="text-xs text-slate-400">
                        Awaiting {humanize(r.current_stage)}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}
