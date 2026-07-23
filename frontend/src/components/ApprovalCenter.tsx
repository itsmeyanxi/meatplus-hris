"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { getApprovals, type ApprovalItem } from "@/lib/approvals";

const TYPE_STYLES: Record<string, string> = {
  leave: "bg-violet-50 text-violet-700",
  overtime: "bg-amber-50 text-amber-700",
  official_business: "bg-sky-50 text-sky-700",
  undertime: "bg-orange-50 text-orange-700",
  coa: "bg-teal-50 text-teal-700",
  correction: "bg-rose-50 text-rose-700",
};

function Badge({ item }: { item: ApprovalItem }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_STYLES[item.type] ?? "bg-slate-100 text-slate-600"}`}>
      {item.type_label}
    </span>
  );
}

/** Compact dashboard card: count + a few most-recent items, links to the full list. */
export function ApprovalQuickCard() {
  const { data } = useQuery({ queryKey: ["my-approvals"], queryFn: getApprovals, refetchInterval: 60_000 });
  const total = data?.total ?? 0;
  if (total === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Pending approvals</h3>
          <p className="text-xs text-slate-500">Requests waiting on you</p>
        </div>
        <span className="flex h-9 min-w-9 items-center justify-center rounded-full bg-teal-600 px-2 text-sm font-bold text-white">{total}</span>
      </div>
      <ul className="mt-3 space-y-2">
        {data!.items.slice(0, 4).map((it) => (
          <li key={`${it.type}-${it.id}`}>
            <Link href={it.url} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition hover:bg-slate-50">
              <span className="flex min-w-0 items-center gap-2">
                <Badge item={it} />
                <span className="truncate text-sm text-slate-700">{it.employee_name}</span>
              </span>
              <span className="shrink-0 text-xs text-slate-400">{it.date}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/my-team" className="mt-3 block text-center text-xs font-semibold text-teal-700 hover:underline">
        Review all ({total}) →
      </Link>
    </div>
  );
}

/** Full list for the My Team page. */
export function ApprovalList() {
  const { data, isLoading } = useQuery({ queryKey: ["my-approvals"], queryFn: getApprovals, refetchInterval: 60_000 });
  const items = data?.items ?? [];

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-800">Pending approvals</h3>
        {data?.total ? (
          <span className="rounded-full bg-teal-600 px-2 py-0.5 text-xs font-bold text-white">{data.total}</span>
        ) : null}
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-8 text-center text-xs text-slate-400">Loading…</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-8 text-center text-sm text-slate-500">
          Nothing is waiting for your approval.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <ul className="divide-y divide-slate-100">
            {items.map((it) => (
              <li key={`${it.type}-${it.id}`}>
                <Link href={it.url} className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-slate-50">
                  <div className="flex min-w-0 items-center gap-3">
                    <Badge item={it} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-800">
                        {it.employee_name}
                        {it.company ? <span className="ml-2 text-xs font-normal text-slate-400">{it.company}</span> : null}
                      </div>
                      <div className="truncate text-xs text-slate-500">{it.summary}</div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-slate-400">{it.date}</span>
                    <span className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500">Review</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
