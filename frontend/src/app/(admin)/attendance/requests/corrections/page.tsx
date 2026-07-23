"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { inputCls } from "@/components/employees/ChildList";
import { RequestTable } from "@/components/approvals/RequestTable";
import { EmployeeSearchSelect } from "@/components/EmployeeSearchSelect";
import { SearchSelect } from "@/components/SearchSelect";
import { correctionsApi, type AttendanceCorrection, type CorrectionInput } from "@/lib/approvals";
import { useAttendancePerms } from "@/lib/permissions";

const FIELDS = ["actual_in", "actual_out", "hours_worked", "is_absent", "is_rest_day", "remarks"];

export default function CorrectionsPage() {
  const qc = useQueryClient();
  const { canManageAttendance } = useAttendancePerms();

  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState<CorrectionInput>({
    employee_id: undefined,
    work_date: "",
    field_to_correct: "actual_in",
    old_value: "",
    new_value: "",
    reason: "",
  });

  const create = useMutation({
    mutationFn: () => correctionsApi.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-corrections"] });
      setForm({ employee_id: undefined, work_date: "", field_to_correct: "actual_in", old_value: "", new_value: "", reason: "" });
      setIsAdding(false);
    },
    meta: { successMessage: "Correction filed." },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Attendance corrections</h2>
          <p className="text-sm text-slate-500">Request a fix to a computed daily record.</p>
        </div>
        <button onClick={() => setIsAdding((v) => !v)} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
          {isAdding ? "Cancel" : "+ File correction"}
        </button>
      </div>

      {isAdding && (
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
          {canManageAttendance && (
            <EmployeeSearchSelect value={form.employee_id ?? ""} onChange={(id) => setForm({ ...form, employee_id: id === "" ? undefined : Number(id) })} placeholder="Employee *" />
          )}
          <input type="date" className={inputCls} value={form.work_date} onChange={(e) => setForm({ ...form, work_date: e.target.value })} required />
          <SearchSelect className={inputCls} value={form.field_to_correct} onChange={(v) => setForm({ ...form, field_to_correct: v })} options={FIELDS.map((f) => ({ value: f, label: f }))} />
          <input className={inputCls} placeholder="Old value" value={form.old_value ?? ""} onChange={(e) => setForm({ ...form, old_value: e.target.value })} />
          <input className={`${inputCls} sm:col-span-2`} placeholder="New value *" value={form.new_value} onChange={(e) => setForm({ ...form, new_value: e.target.value })} required />
          <textarea className={`${inputCls} sm:col-span-3`} placeholder="Reason *" rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required />
          <div className="flex justify-end sm:col-span-3">
            <button type="submit" disabled={create.isPending} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
              {create.isPending ? "Saving…" : "File correction"}
            </button>
          </div>
        </form>
      )}

      <RequestTable<AttendanceCorrection>
        slug="attendance-corrections"
        detailBase="/attendance/requests/corrections"
        api={correctionsApi}
        dateOf={(r) => r.work_date}
        columns={[
          { header: "Date", cell: (r) => <span className="font-mono">{r.work_date}</span> },
          { header: "Field", cell: (r) => <span className="font-mono text-xs">{r.field_to_correct}</span> },
          {
            header: "Old → New",
            cell: (r) => (
              <span className="font-mono text-xs">
                <span className="text-slate-500">{r.old_value ?? "—"}</span>
                {" → "}
                <span className="font-medium">{r.new_value}</span>
              </span>
            ),
          },
          { header: "Reason", cell: (r) => <span className="block max-w-xs truncate">{r.reason}</span> },
        ]}
      />
    </div>
  );
}
