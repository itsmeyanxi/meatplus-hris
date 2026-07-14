"use client";

import { RecordSection } from "./EmployeeProfileSections";

export function TrainingSection({ employeeId }: { employeeId: number }) {
  return (
    <RecordSection
      employeeId={employeeId}
      type="training"
      addLabel="Add Training"
      minWidth="min-w-[1200px]"
      fields={[
        { key: "training_date", label: "Training Date", type: "date" },
        { key: "name", label: "Training Name" },
        { key: "instructor", label: "Instructor / Institution" },
        { key: "nature", label: "Nature of Training" },
        { key: "cost", label: "Training Cost", type: "number" },
        { key: "returning_service_period", label: "Returning Service Period" },
        { key: "corresponding_amount", label: "Corresponding Amount", type: "number" },
        { key: "notes", label: "Training Notes" },
        { key: "start", label: "Start of Training", type: "date" },
        { key: "end", label: "End of Training", type: "date" },
      ]}
    />
  );
}
