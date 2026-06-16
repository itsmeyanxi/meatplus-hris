"use client";

import { useParams } from "next/navigation";
import { officialBusinessApi, type OfficialBusinessRequest } from "@/lib/approvals";
import { RequestDetailView } from "@/components/approvals/RequestDetailView";

export default function OfficialBusinessDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequestDetailView<OfficialBusinessRequest>
      api={officialBusinessApi}
      id={Number(id)}
      slug="official-business-requests"
      title="Official business request"
      backHref="/attendance/requests/official-business"
      rows={(r) => [
        { label: "Date", value: r.date },
        {
          label: "Time",
          value: r.start_time || r.end_time ? `${r.start_time ?? "—"}–${r.end_time ?? "—"}` : "Whole day",
        },
        { label: "Location", value: r.location },
        { label: "Purpose", value: r.purpose },
      ]}
    />
  );
}
