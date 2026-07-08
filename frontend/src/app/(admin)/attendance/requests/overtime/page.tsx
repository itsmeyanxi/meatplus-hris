"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { inputCls } from "@/components/employees/ChildList";
import { RequestTable } from "@/components/approvals/RequestTable";
import { listEmployees } from "@/lib/employees";
import { overtimeApi, type OvertimeInput, type OvertimeRequest } from "@/lib/approvals";

export default function OvertimeRequestsPage() {
  const qc = useQueryClient();
  const { data: empPage } = useQuery({
    queryKey: ["employees", { all: true }],
    queryFn: () => listEmployees({ perPage: 100 }),
  });

  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState<OvertimeInput>({
    employee_id: 0,
    date: "",
    start_time: "",
    end_time: "",
    requested_hours: 0,
    reason: "",
    classification: "normal",
  });

  const create = useMutation({
    mutationFn: () => overtimeApi.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["overtime-requests"] });
      setForm({ employee_id: 0, date: "", start_time: "", end_time: "", requested_hours: 0, reason: "", classification: "normal" });
      setIsAdding(false);
    },
    meta: { successMessage: "Overtime request filed." },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Overtime requests</h2>
          <p className="text-sm text-slate-500">File and track overtime.</p>
        </div>
        <button
          onClick={() => setIsAdding((v) => !v)}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          {isAdding ? "Cancel" : "+ File OT"}
        </button>
      </div>

      {isAdding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3"
        >
          <select
            className={inputCls}
            value={form.employee_id || ""}
            onChange={(e) => setForm({ ...form, employee_id: Number(e.target.value) })}
            required
          >
            <option value="">Employee *</option>
            {empPage?.data.map((e) => (
              <option key={e.id} value={e.id}>
                {e.employee_no} — {e.full_name}
              </option>
            ))}
          </select>
          <input type="date" className={inputCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          <input
            type="number"
            step="0.25"
            min="0.25"
            className={inputCls}
            placeholder="Hours *"
            value={form.requested_hours || ""}
            onChange={(e) => setForm({ ...form, requested_hours: Number(e.target.value) })}
            required
          />
          <input type="time" className={inputCls} value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} required />
          <input type="time" className={inputCls} value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} required />
          <textarea
            className={`${inputCls} sm:col-span-3`}
            placeholder="Reason *"
            rows={2}
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            required
          />
          <div className="flex justify-end sm:col-span-3">
            <button type="submit" disabled={create.isPending} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
              {create.isPending ? "Saving…" : "File request"}
            </button>
          </div>
        </form>
      )}

      <RequestTable<OvertimeRequest>
        slug="overtime-requests"
        detailBase="/attendance/requests/overtime"
        api={overtimeApi}
        dateOf={(r) => r.date}
        columns={[
          {
            header: "Date",
            cell: (r) => (
              <span className="font-mono">
                {r.date}
                <span className="block text-xs text-slate-500">
                  {r.start_time}–{r.end_time}
                </span>
              </span>
            ),
          },
          { header: "Hours", cell: (r) => <span className="font-medium">{r.requested_hours}h</span> },
          { header: "Reason", cell: (r) => <span className="block max-w-xs truncate">{r.reason}</span> },
        ]}
      />
    </div>
  );
}
