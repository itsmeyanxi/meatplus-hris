"use client";

import { useParams } from "next/navigation";
import { undertimeApi, type UndertimeRequest } from "@/lib/approvals";
import { RequestDetailView } from "@/components/approvals/RequestDetailView";

export default function UndertimeDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequestDetailView<UndertimeRequest>
      api={undertimeApi}
      id={Number(id)}
      slug="undertime-requests"
      title="Undertime request"
      backHref="/attendance/requests/undertime"
      rows={(r) => [
        { label: "Date", value: r.date },
        { label: "Time", value: `${r.start_time}–${r.end_time}` },
        { label: "Requested hours", value: `${r.requested_hours}h` },
        { label: "Reason", value: r.reason },
      ]}
    />
  );
}
