import type { RequestStatus } from "@/lib/approvals";

const STYLE: Record<RequestStatus, string> = {
  pending:     "bg-amber-100 text-amber-800",
  approved:    "bg-emerald-100 text-emerald-800",
  rejected:    "bg-red-100 text-red-800",
  cancelled:   "bg-slate-200 text-slate-700",
  resubmitted: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
};

export function StatusPill({ status }: { status: RequestStatus }) {
  return (
    <span
      className={`rounded-md px-2 py-0.5 text-xs font-medium capitalize ${STYLE[status]}`}
    >
      {status}
    </span>
  );
}
