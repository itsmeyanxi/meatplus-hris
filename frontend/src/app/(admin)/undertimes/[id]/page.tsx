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
      backHref="/undertimes"
      rows={(r) => [
        { label: "Date",             value: r.date },
        { label: "Early departure",  value: r.start_time },
        { label: "Scheduled end",    value: r.end_time },
        { label: "Hours",            value: `${r.requested_hours}h` },
        { label: "Reason",           value: r.reason },
      ]}
    />
  );
}
