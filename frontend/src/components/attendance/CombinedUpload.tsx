"use client";

import { AppCard } from "@/components/ui";
import { ImportDataButton } from "@/components/ImportDataButton";
import { importEmployees, employeeImportTemplateUrl } from "@/lib/employees";
import { timeLogRequestsApi } from "@/lib/attendance";

/**
 * One place to bulk-upload both employees and time logs (for the attendance
 * matrix). Each has its own template + importer; employees go straight in, time
 * logs land as pending rows awaiting approval.
 */
export function CombinedUpload() {
  return (
    <AppCard
      title="Bulk upload"
      description="Add employees or time logs from a file. Download the template, fill it in, then upload."
    >
      <div className="flex flex-wrap items-center gap-3">
        <ImportDataButton
          label="Upload employees"
          title="Import employees"
          description="Bulk-add employees into the current company. An existing employee number is updated, never duplicated."
          columns="Employee No · Last/First/Middle Name · Birthdate · Gender · Civil status · Department · Position · Branch · Employment type · Date hired · Mobile · Email"
          templateUrl={employeeImportTemplateUrl}
          importFn={(f) => importEmployees(f)}
          invalidateKeys={[["dtr-matrix"], ["employees"], ["compensations"]]}
        />
        <ImportDataButton
          label="Upload time logs"
          title="Import time logs"
          description="Upload a day-level attendance sheet (Employee ID · Date · Time In · Time Out) or a raw biometric log (Biometric ID · LogTime · In/Out). Rows wait as pending until an approver approves them."
          columns="Employee ID · Date · Time In · Time Out — or — Biometric ID · LogTime · In/Out"
          templateUrl={timeLogRequestsApi.templateUrl}
          importFn={(f) => timeLogRequestsApi.import(f).then((r) => ({ created: r.created, skipped: 0, total: r.total, errors: r.errors }))}
          invalidateKeys={[["dtr-matrix"], ["time-log-requests"]]}
        />
      </div>
    </AppCard>
  );
}
