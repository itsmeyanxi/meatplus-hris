"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listEmployees } from "@/lib/employees";
import { timeLogsApi, type TimeLog, type TimeLogInput } from "@/lib/attendance";
import { inputCls } from "@/components/employees/ChildList";

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
    enabled: true,
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
      <div>
        <h2 className="text-2xl font-semibold">Time logs</h2>
        <p className="text-sm text-slate-500">
          Append-only raw punches. Use this to manually enter logs; biometric/web/mobile sources will populate automatically once integrated.
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold">Filter</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <select
            className={inputCls}
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <option value="">All employees</option>
            {empPage?.data.map((e) => (
              <option key={e.id} value={e.id}>
                {e.employee_no} — {e.full_name}
              </option>
            ))}
          </select>
          <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold">Add manual log</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-4"
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
            type="datetime-local"
            className={inputCls}
            value={form.logged_at}
            onChange={(e) => setForm({ ...form, logged_at: e.target.value.replace("T", " ") + ":00" })}
            required
          />
          <select
            className={inputCls}
            value={form.direction}
            onChange={(e) => setForm({ ...form, direction: e.target.value as TimeLogInput["direction"] })}
          >
            <option value="in">In</option>
            <option value="out">Out</option>
            <option value="break_out">Break out</option>
            <option value="break_in">Break in</option>
          </select>
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {create.isPending ? "Saving…" : "Add log"}
          </button>
        </form>
      </section>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2">Logged at</th>
              <th className="px-4 py-2">Employee #</th>
              <th className="px-4 py-2">Direction</th>
              <th className="px-4 py-2">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                  No logs in this range.
                </td>
              </tr>
            )}
            {items.map((l: TimeLog) => (
              <tr key={l.id} className="hover:bg-slate-50">
                <td className="px-4 py-2 font-mono">{l.logged_at}</td>
                <td className="px-4 py-2">{l.employee_id}</td>
                <td className="px-4 py-2">{l.direction}</td>
                <td className="px-4 py-2 text-slate-500">{l.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
