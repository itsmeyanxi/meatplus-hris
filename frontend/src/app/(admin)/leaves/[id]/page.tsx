"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { StatusPill } from "@/components/approvals/StatusPill";
import { AppCard, PageHeader } from "@/components/ui";
import { leaveAppsApi } from "@/lib/leaves";

export default function LeaveDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = Number(params.id);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["leave-app", id],
    queryFn: () => leaveAppsApi.get(id),
    enabled: Number.isFinite(id),
  });

  if (isLoading) {
    return <div className="p-8 text-center text-slate-500">Loading leave application…</div>;
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Leave application not found</h2>
        <p className="mt-1 text-sm text-slate-500">It may have been removed or you don&apos;t have access.</p>
        <Link href="/leaves" className="mt-6 inline-flex rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800">
          Back to leaves
        </Link>
      </div>
    );
  }

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
        </div>
      </AppCard>

      <AppCard title="Decision">
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
