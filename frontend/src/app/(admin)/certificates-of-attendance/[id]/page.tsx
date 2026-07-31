"use client";

import { useParams } from "next/navigation";
import { certificateOfAttendanceApi, type CertificateOfAttendanceRequest } from "@/lib/approvals";
import { RequestDetailView } from "@/components/approvals/RequestDetailView";

const PUNCH_LABELS: Record<string, string> = {
  in:   "Missing Time In",
  out:  "Missing Time Out",
  both: "Missing Both",
};

function to12h(t: string | null | undefined): string {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export default function CertificateOfAttendanceDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequestDetailView<CertificateOfAttendanceRequest>
      api={certificateOfAttendanceApi}
      id={Number(id)}
      slug="certificate-of-attendance-requests"
      title="Certificate of attendance request"
      backHref="/certificates-of-attendance"
      enableNotifySupervisor
      enableRevert
      rows={(r) => [
        { label: "Date",        value: r.work_date },
        { label: "Type",        value: PUNCH_LABELS[r.missed_punch] ?? r.missed_punch },
        { label: "Clock In",    value: to12h(r.claimed_time_in) },
        { label: "Clock Out",   value: to12h(r.claimed_time_out) },
        { label: "Reason",      value: r.reason },
      ]}
    />
  );
}
