"use client";

import { useParams } from "next/navigation";
import { overtimeApi, type OvertimeRequest } from "@/lib/approvals";
import { RequestDetailView } from "@/components/approvals/RequestDetailView";

export default function OvertimeDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequestDetailView<OvertimeRequest>
      api={overtimeApi}
      id={Number(id)}
      slug="overtime-requests"
      title="Overtime request"
      backHref="/attendance/requests/overtime"
      rows={(r) => [
        { label: "Date", value: r.date },
        { label: "Time", value: `${r.start_time}–${r.end_time}` },
        { label: "Requested hours", value: `${r.requested_hours}h` },
        { label: "Reason", value: r.reason },
      ]}
    />
  );
}
