"use client";

import { useParams } from "next/navigation";
import { correctionsApi, type AttendanceCorrection } from "@/lib/approvals";
import { RequestDetailView } from "@/components/approvals/RequestDetailView";

export default function CorrectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequestDetailView<AttendanceCorrection>
      api={correctionsApi}
      id={Number(id)}
      slug="attendance-corrections"
      title="Attendance correction"
      backHref="/attendance/requests/corrections"
      rows={(r) => [
        { label: "Work date", value: r.work_date },
        { label: "Field to correct", value: r.field_to_correct },
        { label: "Old value", value: r.old_value },
        { label: "New value", value: r.new_value },
        { label: "Reason", value: r.reason },
      ]}
    />
  );
}
