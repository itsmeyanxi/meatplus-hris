import type { RequestStatus } from "@/lib/approvals";

const STYLE: Record<RequestStatus, string> = {
  pending: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  cancelled: "bg-slate-200 text-slate-700",
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
