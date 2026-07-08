"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { StatusPill } from "@/components/approvals/StatusPill";
import type { RequestStatus } from "@/lib/approvals";

type BaseReq = {
  id: number;
  status: RequestStatus;
  employee?: { employee_no: string; full_name: string };
  filed_by?: { name: string } | null;
  approved_by?: { name: string } | null;
  decided_at: string | null;
  decision_remarks: string | null;
  created_at: string;
};

type ReqApi<T> = {
  get: (id: number) => Promise<T>;
  approve: (id: number, remarks?: string) => Promise<T>;
  reject: (id: number, remarks?: string) => Promise<T>;
  cancel: (id: number) => Promise<T>;
};

type Row = { label: string; value: ReactNode };

export function RequestDetailView<T extends BaseReq>({
  api,
  id,
  slug,
  title,
  backHref,
  rows,
}: {
  api: ReqApi<T>;
  id: number;
  slug: string;
  title: string;
  backHref: string;
  rows: (item: T) => Row[];
}) {
  const qc = useQueryClient();
  const detailKey = [slug, id];
  const [approveRemarks, setApproveRemarks] = useState("");
  const [rejectRemarks, setRejectRemarks] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const { data: item, isLoading, isError } = useQuery({
    queryKey: detailKey,
    queryFn: () => api.get(id),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [slug] });
    qc.invalidateQueries({ queryKey: detailKey });
  };

  const approve = useMutation({
    mutationFn: () => api.approve(id, approveRemarks || undefined),
    onSuccess: invalidate,
    meta: { successMessage: "Request approved." },
  });
  const reject = useMutation({
    mutationFn: () => api.reject(id, rejectRemarks || undefined),
    onSuccess: () => { invalidate(); setRejecting(false); },
    meta: { successMessage: "Request rejected." },
  });
  const cancel = useMutation({
    mutationFn: () => api.cancel(id),
    onSuccess: invalidate,
    meta: { successMessage: "Request cancelled." },
  });
  const busy = approve.isPending || reject.isPending || cancel.isPending;

  return (
    <div className="space-y-6">
      <div>
        <Link href={backHref} className="text-sm text-slate-500 hover:text-slate-800">
          ← Back to list
        </Link>
        <h2 className="mt-1 text-2xl font-semibold text-slate-900">{title}</h2>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : isError || !item ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          This request could not be found.
        </div>
      ) : (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Status</p>
                <div className="mt-1">
                  <StatusPill status={item.status} />
                </div>
              </div>
              <p className="text-xs text-slate-400">
                Filed {new Date(item.created_at).toLocaleString()}
              </p>
            </div>

            <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              <Field label="Employee">
                {item.employee ? (
                  <>
                    <span className="font-mono text-xs text-slate-500">{item.employee.employee_no}</span>{" "}
                    {item.employee.full_name}
                  </>
                ) : (
                  "—"
                )}
              </Field>
              {item.filed_by && <Field label="Filed by">{item.filed_by.name}</Field>}
              {rows(item).map((r) => (
                <Field key={r.label} label={r.label}>
                  {r.value || "—"}
                </Field>
              ))}
            </dl>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-slate-800">Decision</h3>
            {item.status === "pending" ? (
              <p className="text-sm text-slate-500">Awaiting a decision.</p>
            ) : (
              <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                <Field label="Decided by">{item.approved_by?.name ?? "—"}</Field>
                <Field label="Decided at">
                  {item.decided_at ? new Date(item.decided_at).toLocaleString() : "—"}
                </Field>
                <Field label="Remarks">{item.decision_remarks ?? "—"}</Field>
              </dl>
            )}

            {item.status === "pending" && (
              <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                {!rejecting ? (
                  <>
                    <textarea
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-900/50"
                      rows={2}
                      placeholder="Remarks (optional)"
                      value={approveRemarks}
                      onChange={(e) => setApproveRemarks(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => approve.mutate()}
                        disabled={busy}
                        className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
                      >
                        {approve.isPending ? "Approving…" : "Approve"}
                      </button>
                      <button
                        onClick={() => setRejecting(true)}
                        disabled={busy}
                        className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => cancel.mutate()}
                        disabled={busy}
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-60"
                      >
                        {cancel.isPending ? "Cancelling…" : "Cancel request"}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <label className="block text-xs font-medium text-slate-600">
                      Rejection reason *
                    </label>
                    <textarea
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-900/50"
                      rows={2}
                      placeholder="Explain the reason for rejection…"
                      value={rejectRemarks}
                      onChange={(e) => setRejectRemarks(e.target.value)}
                      required
                      autoFocus
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => reject.mutate()}
                        disabled={busy || !rejectRemarks.trim()}
                        className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        {reject.isPending ? "Rejecting…" : "Confirm rejection"}
                      </button>
                      <button
                        onClick={() => setRejecting(false)}
                        disabled={busy}
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{children}</dd>
    </div>
  );
}
