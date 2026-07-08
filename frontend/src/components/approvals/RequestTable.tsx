"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { StatusPill } from "@/components/approvals/StatusPill";
import { TableSkeleton, EmptyState } from "@/components/feedback";
import { useAttendancePerms } from "@/lib/permissions";
import type { PaginatedList, PaginationMeta, RequestStatus } from "@/lib/approvals";

type BaseRow = {
  id: number;
  status: RequestStatus;
  employee?: { employee_no: string; full_name: string };
  approved_by?: { name: string } | null;
  decided_at: string | null;
  decision_remarks: string | null;
};

type ReqApi<T> = {
  list: (params?: { status?: RequestStatus; page?: number }) => Promise<PaginatedList<T>>;
  approve: (id: number) => Promise<T>;
  reject: (id: number) => Promise<T>;
  cancel: (id: number) => Promise<T>;
};

export type RequestColumn<T> = { header: string; cell: (r: T) => ReactNode };

const STATUSES: Array<RequestStatus | ""> = ["", "pending", "approved", "rejected", "cancelled"];
const dateCls =
  "rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 outline-none focus:border-slate-400";

export function RequestTable<T extends BaseRow>({
  slug,
  detailBase,
  api,
  columns,
  dateOf,
}: {
  slug: string;
  detailBase: string;
  api: ReqApi<T>;
  columns: RequestColumn<T>[];
  dateOf: (r: T) => string;
}) {
  const qc = useQueryClient();
  const { canManageAttendance, canApprove } = useAttendancePerms();

  const [status, setStatus] = useState<RequestStatus | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [errorRowId, setErrorRowId] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  // Reset page when status filter changes
  const handleStatusChange = (s: RequestStatus | "") => {
    setStatus(s);
    setPage(1);
  };

  const { data: result, isLoading } = useQuery({
    queryKey: [slug, { status, page }],
    queryFn: () => api.list({ status: status || undefined, page }),
  });
  const rows = result?.data ?? [];
  const meta: PaginationMeta | undefined = result?.meta;

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        const d = dateOf(r);
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      }),
    [rows, from, to, dateOf],
  );

  const pendingIds = useMemo(
    () => filtered.filter((r) => r.status === "pending").map((r) => r.id),
    [filtered],
  );
  const selectedPending = pendingIds.filter((id) => selected.has(id));
  const allSelected = pendingIds.length > 0 && selectedPending.length === pendingIds.length;

  const invalidate = () => qc.invalidateQueries({ queryKey: [slug] });

  const act = useMutation({
    mutationFn: ({ id, action }: { id: number; action: "approve" | "reject" | "cancel" }) =>
      api[action](id),
    onSuccess: () => { invalidate(); setErrorRowId(null); },
    onError: (_err, variables) => setErrorRowId(variables.id),
  });

  const bulk = useMutation({
    mutationFn: async ({ action, ids }: { action: "approve" | "reject"; ids: number[] }) => {
      await Promise.all(ids.map((id) => api[action](id)));
      return { action, count: ids.length };
    },
    onSuccess: (res) => {
      invalidate();
      setSelected(new Set());
      toast.success(`${res.count} request(s) ${res.action === "approve" ? "approved" : "rejected"}.`);
    },
  });

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(pendingIds));

  const colCount =
    (canApprove ? 1 : 0) + 2 + (canManageAttendance ? 1 : 0) + columns.length;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-600">Status</p>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s || "all"}
                  onClick={() => handleStatusChange(s)}
                  className={
                    status === s
                      ? "rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium capitalize text-white"
                      : "rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium capitalize hover:bg-slate-100"
                  }
                >
                  {s || "All"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-600">From</p>
            <input type="date" className={dateCls} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-600">To</p>
            <input type="date" className={dateCls} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </div>
          {(from || to) && (
            <button
              onClick={() => {
                setFrom("");
                setTo("");
              }}
              className="text-xs font-medium text-slate-500 hover:text-slate-800"
            >
              Clear dates
            </button>
          )}
        </div>
      </section>

      {/* Bulk action bar */}
      {canApprove && selectedPending.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-white">
          <span className="text-sm font-medium">{selectedPending.length} selected</span>
          <div className="flex gap-2">
            <button
              disabled={bulk.isPending}
              onClick={() => bulk.mutate({ action: "approve", ids: selectedPending })}
              className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium hover:bg-green-700 disabled:opacity-60"
            >
              {bulk.isPending ? "Working…" : "Approve selected"}
            </button>
            <button
              disabled={bulk.isPending}
              onClick={() => bulk.mutate({ action: "reject", ids: selectedPending })}
              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium hover:bg-red-700 disabled:opacity-60"
            >
              Reject selected
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        {isLoading ? (
          <TableSkeleton rows={5} cols={colCount} />
        ) : filtered.length === 0 ? (
          <EmptyState title="No requests" message="Nothing matches the current filters." />
        ) : (
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                {canApprove && (
                  <th className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      disabled={pendingIds.length === 0}
                      aria-label="Select all pending"
                    />
                  </th>
                )}
                <th className="px-3 py-2">Status</th>
                {canManageAttendance && <th className="px-3 py-2">Employee</th>}
                {columns.map((c) => (
                  <th key={c.header} className="px-3 py-2">
                    {c.header}
                  </th>
                ))}
                <th className="px-3 py-2">Decision</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <tr key={r.id} className={selected.has(r.id) ? "bg-sky-50/50" : ""}>
                  {canApprove && (
                    <td className="px-3 py-2">
                      {r.status === "pending" && (
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggle(r.id)}
                          aria-label={`Select request ${r.id}`}
                        />
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <StatusPill status={r.status} />
                  </td>
                  {canManageAttendance && (
                    <td className="px-3 py-2">
                      <div className="font-mono text-xs text-slate-500">{r.employee?.employee_no}</div>
                      <div>{r.employee?.full_name}</div>
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c.header} className="px-3 py-2">
                      {c.cell(r)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-xs">
                    {r.approved_by ? (
                      <div>
                        <div className="text-slate-700">{r.approved_by.name}</div>
                        {r.decided_at && (
                          <div className="text-xs text-slate-400">
                            {new Date(r.decided_at).toLocaleDateString()}
                          </div>
                        )}
                        {r.decision_remarks && (
                          <div className="text-xs italic text-slate-500">&ldquo;{r.decision_remarks}&rdquo;</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`${detailBase}/${r.id}`}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-100"
                      >
                        View
                      </Link>
                      {r.status === "pending" && (
                        <>
                          {canApprove && (
                            <>
                              <button
                                onClick={() => act.mutate({ id: r.id, action: "approve" })}
                                className="rounded-md bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => act.mutate({ id: r.id, action: "reject" })}
                                className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => act.mutate({ id: r.id, action: "cancel" })}
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-100"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                    {act.isError && errorRowId === r.id && (
                      <p className="text-xs text-red-600 mt-1">Failed. Please try again.</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          {meta
            ? `Showing ${filtered.length} of ${meta.total} total (page ${meta.current_page} of ${meta.last_page})`
            : `Showing ${filtered.length}`}
        </p>
        {meta && meta.last_page > 1 && (
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-100 disabled:opacity-40"
            >
              Prev
            </button>
            <span className="text-xs text-slate-500">{page} / {meta.last_page}</span>
            <button
              disabled={page >= meta.last_page}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-100 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
