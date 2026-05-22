"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ChildListShell, EmptyRow, inputCls } from "@/components/employees/ChildList";
import {
  dtrApi,
  employeeSchedulesApi,
  timeLogsApi,
  workSchedulesApi,
  type DailyTimeRecord,
  type ScheduleAssignment,
} from "@/lib/attendance";

export default function EmployeeAttendanceTab() {
  const params = useParams<{ id: string }>();
  const employeeId = Number(params.id);
  const qc = useQueryClient();

  // ---- Schedule assignments ----
  const assignmentsKey = ["schedule-assignments", employeeId];
  const { data: assignments = [] } = useQuery({
    queryKey: assignmentsKey,
    queryFn: () => employeeSchedulesApi.list(employeeId),
  });
  const { data: workSchedules = [] } = useQuery({
    queryKey: ["work-schedules"],
    queryFn: workSchedulesApi.list,
  });

  const [isAssigning, setIsAssigning] = useState(false);
  const [assignForm, setAssignForm] = useState({
    work_schedule_id: 0,
    effective_from: "",
    effective_to: "",
  });
  const assign = useMutation({
    mutationFn: () =>
      employeeSchedulesApi.create(employeeId, {
        work_schedule_id: Number(assignForm.work_schedule_id),
        effective_from: assignForm.effective_from,
        effective_to: assignForm.effective_to || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: assignmentsKey });
      setIsAssigning(false);
      setAssignForm({ work_schedule_id: 0, effective_from: "", effective_to: "" });
    },
  });

  // ---- DTR range (default: last 30 days) ----
  const today = new Date().toISOString().slice(0, 10);
  const thirtyAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(thirtyAgo);
  const [to, setTo] = useState(today);

  const dtrKey = ["dtr-for-employee", employeeId, from, to];
  const { data: dtrs = [] } = useQuery({
    queryKey: dtrKey,
    queryFn: () => dtrApi.list({ employee_id: employeeId, from, to }),
  });

  const compute = useMutation({
    mutationFn: () => dtrApi.compute({ employee_id: employeeId, from, to }),
    onSuccess: () => qc.invalidateQueries({ queryKey: dtrKey }),
  });

  // ---- Quick punch in/out ----
  const punch = useMutation({
    mutationFn: (direction: "in" | "out") =>
      timeLogsApi.create({
        employee_id: employeeId,
        logged_at: new Date().toISOString().slice(0, 19).replace("T", " "),
        direction,
        source: "web",
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["time-logs"] }),
  });

  return (
    <div className="space-y-8">
      {/* Schedule assignments */}
      <ChildListShell
        title="Schedule assignments"
        count={assignments.length}
        isAdding={isAssigning}
        toggle={() => setIsAssigning((v) => !v)}
      >
        {isAssigning && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              assign.mutate();
            }}
            className="rounded-xl border border-slate-200 bg-white p-4 grid grid-cols-1 gap-3 sm:grid-cols-3"
          >
            <select
              className={inputCls}
              value={assignForm.work_schedule_id}
              onChange={(e) =>
                setAssignForm({ ...assignForm, work_schedule_id: Number(e.target.value) })
              }
              required
            >
              <option value={0}>Schedule *</option>
              {workSchedules.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              className={inputCls}
              value={assignForm.effective_from}
              onChange={(e) => setAssignForm({ ...assignForm, effective_from: e.target.value })}
              required
            />
            <input
              type="date"
              className={inputCls}
              value={assignForm.effective_to}
              onChange={(e) => setAssignForm({ ...assignForm, effective_to: e.target.value })}
              placeholder="Optional end"
            />
            <div className="sm:col-span-3 flex justify-end">
              <button
                type="submit"
                disabled={assign.isPending}
                className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {assign.isPending ? "Saving…" : "Assign schedule"}
              </button>
            </div>
          </form>
        )}

        {assignments.length === 0 ? (
          <EmptyRow message="No schedule assigned. Without one, the DTR engine can't compute scheduled hours." />
        ) : (
          <ul className="space-y-2">
            {assignments.map((a: ScheduleAssignment) => (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-4 py-2 text-sm"
              >
                <span>
                  <strong>{a.work_schedule.name}</strong>{" "}
                  <span className="text-slate-500">
                    ({a.effective_from} → {a.effective_to ?? "ongoing"})
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </ChildListShell>

      {/* Quick punch */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">Quick punch</h3>
            <p className="text-xs text-slate-500">
              Logs the current time. Use for missed/manual punches; biometric integration will populate this automatically later.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => punch.mutate("in")}
              disabled={punch.isPending}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:opacity-60"
            >
              Punch in
            </button>
            <button
              onClick={() => punch.mutate("out")}
              disabled={punch.isPending}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            >
              Punch out
            </button>
          </div>
        </div>
      </section>

      {/* DTR */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Daily time records</h3>
          <div className="flex items-center gap-2">
            <input
              type="date"
              className={inputCls + " w-auto"}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <span className="text-xs text-slate-500">to</span>
            <input
              type="date"
              className={inputCls + " w-auto"}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            <button
              onClick={() => compute.mutate()}
              disabled={compute.isPending}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {compute.isPending ? "Computing…" : "Compute"}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">In</th>
                <th className="px-3 py-2">Out</th>
                <th className="px-3 py-2">Hours</th>
                <th className="px-3 py-2">Late</th>
                <th className="px-3 py-2">OT</th>
                <th className="px-3 py-2">Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dtrs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                    No DTR rows in this range. Click <strong>Compute</strong>.
                  </td>
                </tr>
              )}
              {dtrs.map((d: DailyTimeRecord) => (
                <tr
                  key={d.id}
                  className={
                    d.is_absent
                      ? "bg-red-50"
                      : d.is_rest_day
                      ? "bg-slate-50"
                      : d.holiday_type
                      ? "bg-amber-50"
                      : ""
                  }
                >
                  <td className="px-3 py-2 font-mono">{d.work_date}</td>
                  <td className="px-3 py-2">{d.actual_in ? d.actual_in.slice(11, 16) : "—"}</td>
                  <td className="px-3 py-2">{d.actual_out ? d.actual_out.slice(11, 16) : "—"}</td>
                  <td className="px-3 py-2 font-medium">{d.hours_worked}</td>
                  <td className="px-3 py-2">{d.late_minutes ? `${d.late_minutes}m` : "—"}</td>
                  <td className="px-3 py-2">{d.overtime_minutes ? `${d.overtime_minutes}m` : "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    {[
                      d.is_absent ? "absent" : null,
                      d.is_rest_day ? "rest" : null,
                      d.holiday_type ?? null,
                      d.is_on_leave ? "leave" : null,
                    ]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
