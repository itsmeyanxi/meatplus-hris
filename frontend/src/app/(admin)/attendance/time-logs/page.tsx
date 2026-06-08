"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listEmployees } from "@/lib/employees";
import { timeLogsApi, type TimeLog, type TimeLogInput } from "@/lib/attendance";
import { AppButton, AppCard, PageHeader, TableShell } from "@/components/ui";

const inputCls =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-900/50";
const labelCls = "mb-1.5 block text-sm font-medium text-slate-700";

export default function TimeLogsPage() {
  const qc = useQueryClient();

  const { data: empPage } = useQuery({
    queryKey: ["employees", { all: true }],
    queryFn: () => listEmployees({ perPage: 100 }),
  });

  const [employeeId, setEmployeeId] = useState<number | "">("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const filterKey = ["time-logs", { employeeId, from, to }];
  const { data: items = [] } = useQuery({
    queryKey: filterKey,
    queryFn: () =>
      timeLogsApi.list({
        employee_id: employeeId === "" ? undefined : Number(employeeId),
        from: from || undefined,
        to: to || undefined,
      }),
  });

  const [form, setForm] = useState<TimeLogInput>({
    employee_id: 0,
    logged_at: "",
    direction: "in",
    source: "manual",
  });

  const create = useMutation({
    mutationFn: () => timeLogsApi.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["time-logs"] });
      setForm({ ...form, logged_at: "" });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Time logs"
        description="Append-only raw punches. Enter logs manually here; biometric/web/mobile sources populate automatically once integrated."
      />

      <AppCard title="Filter">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelCls}>Employee</label>
            <select className={inputCls} value={employeeId} onChange={(e) => setEmployeeId(e.target.value === "" ? "" : Number(e.target.value))}>
              <option value="">All employees</option>
              {empPage?.data.map((e) => (<option key={e.id} value={e.id}>{e.employee_no} — {e.full_name}</option>))}
            </select>
          </div>
          <div>
            <label className={labelCls}>From</label>
            <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>To</label>
            <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </AppCard>

      <AppCard title="Add manual log">
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <label className={labelCls}>Employee *</label>
            <select className={inputCls} value={form.employee_id || ""} onChange={(e) => setForm({ ...form, employee_id: Number(e.target.value) })} required>
              <option value="">Select…</option>
              {empPage?.data.map((e) => (<option key={e.id} value={e.id}>{e.employee_no} — {e.full_name}</option>))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Logged at *</label>
            <input type="datetime-local" className={inputCls} value={form.logged_at} onChange={(e) => setForm({ ...form, logged_at: e.target.value.replace("T", " ") + ":00" })} required />
          </div>
          <div>
            <label className={labelCls}>Direction</label>
            <select className={inputCls} value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as TimeLogInput["direction"] })}>
              <option value="in">In</option>
              <option value="out">Out</option>
              <option value="break_out">Break out</option>
              <option value="break_in">Break in</option>
            </select>
          </div>
          <div className="flex items-end">
            <AppButton type="submit" className="w-full" disabled={create.isPending}>{create.isPending ? "Saving…" : "Add log"}</AppButton>
          </div>
        </form>
      </AppCard>

      <TableShell>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
              {["Logged at", "Employee #", "Direction", "Source"].map((h) => (
                <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-16 text-center">
                  <p className="text-sm font-medium text-slate-700">No logs in this range</p>
                  <p className="mt-1 text-sm text-slate-500">Adjust the filter or add a manual log above.</p>
                </td>
              </tr>
            )}
            {items.map((l: TimeLog) => (
              <tr key={l.id} className="border-t border-slate-100 transition hover:bg-slate-50/70">
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{l.logged_at}</td>
                <td className="px-4 py-3 text-slate-600">{l.employee_id}</td>
                <td className="px-4 py-3 capitalize text-slate-700">{l.direction.replace("_", " ")}</td>
                <td className="px-4 py-3 text-slate-500">{l.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}
