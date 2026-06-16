"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { inputCls } from "@/components/employees/ChildList";
import { RequestTable } from "@/components/approvals/RequestTable";
import { listEmployees } from "@/lib/employees";
import { officialBusinessApi, type OfficialBusinessInput, type OfficialBusinessRequest } from "@/lib/approvals";
import { useAttendancePerms } from "@/lib/permissions";

export default function OBRequestsPage() {
  const qc = useQueryClient();
  const { canManageAttendance } = useAttendancePerms();

  const { data: empPage } = useQuery({
    queryKey: ["employees", { all: true }],
    queryFn: () => listEmployees({ perPage: 100 }),
    enabled: canManageAttendance,
  });

  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState<OfficialBusinessInput>({
    employee_id: undefined,
    date: "",
    location: "",
    purpose: "",
  });

  const create = useMutation({
    mutationFn: () => officialBusinessApi.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["official-business-requests"] });
      setForm({ employee_id: undefined, date: "", location: "", purpose: "" });
      setIsAdding(false);
    },
    meta: { successMessage: "Official business request filed." },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Official business requests</h2>
          <p className="text-sm text-slate-500">File for work conducted outside the office.</p>
        </div>
        <button onClick={() => setIsAdding((v) => !v)} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
          {isAdding ? "Cancel" : "+ File OB"}
        </button>
      </div>

      {isAdding && (
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
          {canManageAttendance && (
            <select className={inputCls} value={form.employee_id ?? ""} onChange={(e) => setForm({ ...form, employee_id: e.target.value ? Number(e.target.value) : undefined })} required>
              <option value="">Employee *</option>
              {empPage?.data.map((e) => (<option key={e.id} value={e.id}>{e.employee_no} — {e.full_name}</option>))}
            </select>
          )}
          <input type="date" className={inputCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          <input className={inputCls} placeholder="Location *" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} required />
          <textarea className={`${inputCls} sm:col-span-3`} placeholder="Purpose *" rows={2} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} required />
          <div className="flex justify-end sm:col-span-3">
            <button type="submit" disabled={create.isPending} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
              {create.isPending ? "Saving…" : "File request"}
            </button>
          </div>
        </form>
      )}

      <RequestTable<OfficialBusinessRequest>
        slug="official-business-requests"
        detailBase="/attendance/requests/official-business"
        api={officialBusinessApi}
        dateOf={(r) => r.date}
        columns={[
          { header: "Date", cell: (r) => <span className="font-mono">{r.date}</span> },
          { header: "Location", cell: (r) => r.location },
          { header: "Purpose", cell: (r) => <span className="block max-w-xs truncate">{r.purpose}</span> },
        ]}
      />
    </div>
  );
}
