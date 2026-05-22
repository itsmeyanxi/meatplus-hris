"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { inputCls } from "@/components/employees/ChildList";
import { StatusPill } from "@/components/approvals/StatusPill";
import { listEmployees } from "@/lib/employees";
import {
  overtimeApi,
  type OvertimeInput,
  type OvertimeRequest,
  type RequestStatus,
} from "@/lib/approvals";

export default function OvertimeRequestsPage() {
  const qc = useQueryClient();

  const { data: empPage } = useQuery({
    queryKey: ["employees", { all: true }],
    queryFn: () => listEmployees({ perPage: 100 }),
  });

  const [status, setStatus] = useState<RequestStatus | "">("");
  const filterKey = ["overtime-requests", { status }];
  const { data: items = [] } = useQuery({
    queryKey: filterKey,
    queryFn: () => overtimeApi.list({ status: status || undefined }),
  });

  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState<OvertimeInput>({
    employee_id: 0,
    date: "",
    start_time: "",
    end_time: "",
    requested_hours: 0,
    reason: "",
  });

  const create = useMutation({
    mutationFn: () => overtimeApi.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["overtime-requests"] });
      setForm({ employee_id: 0, date: "", start_time: "", end_time: "", requested_hours: 0, reason: "" });
      setIsAdding(false);
    },
  });
  const approve = useMutation({
    mutationFn: (id: number) => overtimeApi.approve(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["overtime-requests"] }),
  });
  const reject = useMutation({
    mutationFn: (id: number) => overtimeApi.reject(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["overtime-requests"] }),
  });
  const cancel = useMutation({
    mutationFn: (id: number) => overtimeApi.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["overtime-requests"] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Overtime requests</h2>
          <p className="text-sm text-slate-500">{items.length} shown</p>
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
          className="rounded-xl border border-slate-200 bg-white p-4 grid grid-cols-1 gap-3 sm:grid-cols-3"
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
          <input
            type="date"
            className={inputCls}
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            required
          />
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
          <input
            type="time"
            className={inputCls}
            placeholder="Start"
            value={form.start_time}
            onChange={(e) => setForm({ ...form, start_time: e.target.value })}
            required
          />
          <input
            type="time"
            className={inputCls}
            placeholder="End"
            value={form.end_time}
            onChange={(e) => setForm({ ...form, end_time: e.target.value })}
            required
          />
          <textarea
            className={`${inputCls} sm:col-span-3`}
            placeholder="Reason *"
            rows={2}
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            required
          />
          <div className="sm:col-span-3 flex justify-end">
            <button
              type="submit"
              disabled={create.isPending}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {create.isPending ? "Saving…" : "File request"}
            </button>
          </div>
        </form>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold">Filter</h3>
        <div className="flex gap-2">
          {(["", "pending", "approved", "rejected", "cancelled"] as const).map((s) => (
            <button
              key={s || "all"}
              onClick={() => setStatus(s)}
              className={
                status === s
                  ? "rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white capitalize"
                  : "rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 capitalize"
              }
            >
              {s || "All"}
            </button>
          ))}
        </div>
      </section>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Employee</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Hours</th>
              <th className="px-3 py-2">Reason</th>
              <th className="px-3 py-2">Decision</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  No requests match.
                </td>
              </tr>
            )}
            {items.map((r: OvertimeRequest) => (
              <tr key={r.id}>
                <td className="px-3 py-2"><StatusPill status={r.status} /></td>
                <td className="px-3 py-2">
                  <div className="text-xs font-mono text-slate-500">{r.employee?.employee_no}</div>
                  <div>{r.employee?.full_name}</div>
                </td>
                <td className="px-3 py-2 font-mono">
                  {r.date}
                  <div className="text-xs text-slate-500">
                    {r.start_time}–{r.end_time}
                  </div>
                </td>
                <td className="px-3 py-2 font-medium">{r.requested_hours}h</td>
                <td className="px-3 py-2 max-w-xs">{r.reason}</td>
                <td className="px-3 py-2 text-xs">
                  {r.approved_by ? (
                    <>
                      <div>by {r.approved_by.name}</div>
                      <div className="text-slate-500">{r.decision_remarks ?? "—"}</div>
                    </>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.status === "pending" && (
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => approve.mutate(r.id)}
                        className="rounded-md bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => reject.mutate(r.id)}
                        className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => cancel.mutate(r.id)}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
