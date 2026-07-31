"use client";

import { useParams } from "next/navigation";
import {
  certificateOfAttendanceApi,
  type CertificateOfAttendanceRequest,
} from "@/lib/approvals";
import { RequestDetailView } from "@/components/approvals/RequestDetailView";

export default function CertificateOfAttendanceDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequestDetailView<CertificateOfAttendanceRequest>
      api={certificateOfAttendanceApi}
      id={Number(id)}
      slug="certificate-of-attendance-requests"
      title="Certificate of attendance"
      backHref="/attendance/requests/certificate-of-attendance"
      enableNotifySupervisor
      enableRevert
      rows={(r) => [
        { label: "Work date", value: r.work_date },
        { label: "Missed punch", value: r.missed_punch },
        { label: "Claimed time in", value: r.claimed_time_in },
        { label: "Claimed time out", value: r.claimed_time_out },
        { label: "Reason", value: r.reason },
      ]}
    />
  );
}
