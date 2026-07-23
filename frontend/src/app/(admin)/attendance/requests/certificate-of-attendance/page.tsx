"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { inputCls } from "@/components/employees/ChildList";
import { RequestTable } from "@/components/approvals/RequestTable";
import { EmployeeSearchSelect } from "@/components/EmployeeSearchSelect";
import { SearchSelect } from "@/components/SearchSelect";
import {
  certificateOfAttendanceApi,
  type CertificateOfAttendanceInput,
  type CertificateOfAttendanceRequest,
} from "@/lib/approvals";
import { useAttendancePerms } from "@/lib/permissions";

export default function COAPage() {
  const qc = useQueryClient();
  const { canManageAttendance } = useAttendancePerms();

  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState<CertificateOfAttendanceInput>({
    employee_id: undefined,
    work_date: "",
    missed_punch: "out",
    claimed_time_in: "",
    claimed_time_out: "",
    reason: "",
  });

  const create = useMutation({
    mutationFn: () => certificateOfAttendanceApi.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["certificate-of-attendance-requests"] });
      setForm({ employee_id: undefined, work_date: "", missed_punch: "out", claimed_time_in: "", claimed_time_out: "", reason: "" });
      setIsAdding(false);
    },
    meta: { successMessage: "Certificate of attendance filed." },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Certificate of attendance</h2>
          <p className="text-sm text-slate-500">File when you missed a punch — claim the time you actually arrived/left.</p>
        </div>
        <button onClick={() => setIsAdding((v) => !v)} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
          {isAdding ? "Cancel" : "+ File COA"}
        </button>
      </div>

      {isAdding && (
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
          {canManageAttendance && (
            <EmployeeSearchSelect value={form.employee_id ?? ""} onChange={(id) => setForm({ ...form, employee_id: id === "" ? undefined : Number(id) })} placeholder="Employee *" />
          )}
          <input type="date" className={inputCls} value={form.work_date} onChange={(e) => setForm({ ...form, work_date: e.target.value })} required />
          <SearchSelect className={inputCls} value={form.missed_punch} onChange={(v) => setForm({ ...form, missed_punch: v as CertificateOfAttendanceInput["missed_punch"] })} options={[{ value: "in", label: "Missed: In" }, { value: "out", label: "Missed: Out" }, { value: "both", label: "Missed: Both" }]} />
          <input type="time" className={inputCls} placeholder="Claimed time in" value={form.claimed_time_in ?? ""} onChange={(e) => setForm({ ...form, claimed_time_in: e.target.value })} />
          <input type="time" className={inputCls} placeholder="Claimed time out" value={form.claimed_time_out ?? ""} onChange={(e) => setForm({ ...form, claimed_time_out: e.target.value })} />
          <div />
          <textarea className={`${inputCls} sm:col-span-3`} placeholder="Reason *" rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required />
          <div className="flex justify-end sm:col-span-3">
            <button type="submit" disabled={create.isPending} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
              {create.isPending ? "Saving…" : "File certificate"}
            </button>
          </div>
        </form>
      )}

      <RequestTable<CertificateOfAttendanceRequest>
        slug="certificate-of-attendance-requests"
        detailBase="/attendance/requests/certificate-of-attendance"
        api={certificateOfAttendanceApi}
        dateOf={(r) => r.work_date}
        columns={[
          { header: "Work date", cell: (r) => <span className="font-mono">{r.work_date}</span> },
          { header: "Missed", cell: (r) => <span className="capitalize">{r.missed_punch}</span> },
          {
            header: "Claimed",
            cell: (r) => (
              <span className="font-mono text-xs">
                {r.claimed_time_in && <>in: {r.claimed_time_in}<br /></>}
                {r.claimed_time_out && <>out: {r.claimed_time_out}</>}
                {!r.claimed_time_in && !r.claimed_time_out && "—"}
              </span>
            ),
          },
          { header: "Reason", cell: (r) => <span className="block max-w-xs truncate">{r.reason}</span> },
        ]}
      />
    </div>
  );
}
