"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { getMe } from "@/lib/auth";
import { getEmployee, updateEmployee } from "@/lib/employees";
import { workSchedulesApi, employeeSchedulesApi, type WorkSchedule } from "@/lib/attendance";
import { SearchSelect } from "@/components/SearchSelect";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const SCHED_TYPES = [
  { value: "regular", label: "Regular", hint: "punches", desc: "Must time in / out on scheduled days. Tracked for lates, undertime and absences." },
  { value: "flexible", label: "Flexible / Flexi-time", hint: "no late", desc: "Punches, but no late penalty — arrive anytime and complete the required hours. Still absent if there's no punch at all." },
  { value: "shifting", label: "Shifting / Rotating", hint: "punches", desc: "Punches; lates and absences tracked against the shift assigned for the day. Use schedule adjustments for rotating shifts." },
  { value: "part_time", label: "Part-time", hint: "hourly", desc: "Punches; tracked; paid for the hours actually worked (set pay type to Hourly in Compensation)." },
  { value: "exempted", label: "Exempted (always present)", hint: "no punch", desc: "Doesn't punch — never marked absent, automatically credited the scheduled hours (supervisors, managers, office staff)." },
  { value: "field", label: "Field personnel", hint: "no punch", desc: "Works off-site and doesn't punch — always present, credited the scheduled hours." },
];

function t12(t: string | null): string {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(m).padStart(2, "0")} ${ap}`;
}

export default function EmployeeSchedulePage() {
  const params = useParams<{ id: string }>();
  const employeeId = Number(params.id);
  const qc = useQueryClient();

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const perms = me?.user.permissions ?? [];
  const canManage = (me?.user.roles?.includes("it_admin") ?? false) || (me?.user.roles?.includes("admin") ?? false) || perms.includes("attendance.manage");

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["employee-schedule", employeeId],
    queryFn: () => employeeSchedulesApi.list(employeeId),
  });
  const { data: schedules = [] } = useQuery({ queryKey: ["work-schedules"], queryFn: workSchedulesApi.list, enabled: canManage });

  // The employee, for the schedule type.
  const { data: emp } = useQuery({ queryKey: ["employee", employeeId], queryFn: () => getEmployee(employeeId) });
  const schedType = emp?.schedule_type ?? "regular";
  const typeInfo = SCHED_TYPES.find((t) => t.value === schedType) ?? SCHED_TYPES[0];
  const noPunch = schedType === "exempted" || schedType === "field";
  const setType = useMutation({
    mutationFn: (value: string) => updateEmployee(employeeId, { schedule_type: value }),
    onSuccess: (_d, value) => {
      toast.success(`Schedule type set to ${SCHED_TYPES.find((t) => t.value === value)?.label ?? value}.`);
      qc.invalidateQueries({ queryKey: ["employee", employeeId] });
    },
    onError: () => toast.error("Couldn't change the schedule type."),
  });

  const current = assignments[0]; // newest effective_from first
  const [wsId, setWsId] = useState("");
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [adding, setAdding] = useState(false);

  const selected: WorkSchedule | undefined = useMemo(
    () => schedules.find((s) => String(s.id) === wsId),
    [schedules, wsId],
  );
  // The full day breakdown for the currently-assigned schedule (from the list).
  const currentFull = useMemo(
    () => schedules.find((s) => s.id === current?.work_schedule.id),
    [schedules, current],
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: ["employee-schedule", employeeId] });
  const assign = useMutation({
    mutationFn: () => employeeSchedulesApi.create(employeeId, { work_schedule_id: Number(wsId), effective_from: from }),
    onSuccess: () => { toast.success("Schedule assigned."); setAdding(false); setWsId(""); invalidate(); },
    onError: () => toast.error("Couldn't assign the schedule."),
  });
  const remove = useMutation({
    mutationFn: (id: number) => employeeSchedulesApi.destroy(employeeId, id),
    onSuccess: () => { toast.success("Assignment removed."); invalidate(); },
    onError: () => toast.error("Couldn't remove."),
  });

  return (
    <div className="space-y-6">
      {/* Schedule TYPE: Regular vs Exempted — dropdown */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-[260px]">
            <label className="mb-1 block text-sm font-semibold text-slate-800">Schedule type</label>
            <p className="mb-2 text-xs text-slate-400">Whether this employee must clock in/out, or is exempted (always present).</p>
            <SearchSelect
              value={schedType}
              onChange={(v) => setType.mutate(v)}
              disabled={!canManage || setType.isPending || !emp}
              options={SCHED_TYPES.map((t) => ({ value: t.value, label: t.label, hint: t.hint }))}
            />
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${noPunch ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-600"}`}>
            {noPunch ? "Always present — no punch" : "Punches in / out"}
          </span>
        </div>
        <p className="mt-3 text-xs text-slate-500">{typeInfo.desc}</p>
        {!canManage && <p className="mt-1 text-xs text-slate-400">You don&apos;t have permission to change this.</p>}
      </div>

      {/* Current scheduling type */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Scheduling type</h3>
            {isLoading ? (
              <p className="mt-1 text-sm text-slate-400">Loading…</p>
            ) : current ? (
              <>
                <p className="mt-1 text-lg font-bold text-slate-900">{current.work_schedule.name}</p>
                <p className="text-xs text-slate-400">
                  {current.work_schedule.code} · effective {current.effective_from ?? "—"}
                  {current.effective_to ? ` → ${current.effective_to}` : " (current)"}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-amber-600">No schedule assigned — this employee isn&apos;t absence-tracked.</p>
            )}
          </div>
          {canManage && (
            <button onClick={() => setAdding((v) => !v)} className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800">
              {adding ? "Cancel" : "Change schedule"}
            </button>
          )}
        </div>

        {/* Assign form */}
        {adding && canManage && (
          <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
            <div className="min-w-[280px] flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-500">Work schedule</label>
              <SearchSelect
                value={wsId}
                onChange={setWsId}
                placeholder="Pick a schedule…"
                options={schedules.filter((s) => s.is_active).map((s) => ({ value: String(s.id), label: s.name, hint: `${s.weekly_workdays}d` }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Effective from</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <button onClick={() => assign.mutate()} disabled={!wsId || assign.isPending}
              className="rounded-lg bg-teal-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
              {assign.isPending ? "Saving…" : "Assign"}
            </button>
          </div>
        )}
      </div>

      {/* Weekly pattern of the schedule being viewed (selected in the form, else current) */}
      {(() => {
        const show = selected ?? currentFull;
        if (!show?.days) return null;
        const byDow = new Map(show.days.map((d) => [d.day_of_week, d]));
        return (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-slate-800">
              Weekly pattern <span className="font-normal text-slate-400">— {show.name}</span>
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                const day = byDow.get(d);
                const rest = !day || day.is_rest_day;
                return (
                  <div key={d} className={`rounded-xl border p-3 text-center ${rest ? "border-slate-100 bg-slate-50" : "border-teal-100 bg-teal-50/50"}`}>
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{DOW[d]}</div>
                    {rest ? (
                      <div className="mt-1 text-xs font-medium text-slate-400">Rest day</div>
                    ) : (
                      <>
                        <div className="mt-1 text-xs font-semibold text-slate-700">{t12(day!.time_in)}</div>
                        <div className="text-xs text-slate-400">to {t12(day!.time_out)}</div>
                        <div className="mt-1 text-[10px] text-slate-400">{Number(day!.required_hours)}h</div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* History */}
      {assignments.length > 1 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">Schedule history</h3>
          <ul className="divide-y divide-slate-100">
            {assignments.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2">
                <div>
                  <span className="text-sm text-slate-700">{a.work_schedule.name}</span>
                  <span className="ml-2 text-xs text-slate-400">from {a.effective_from ?? "—"}{a.effective_to ? ` to ${a.effective_to}` : ""}</span>
                </div>
                {canManage && (
                  <button onClick={() => remove.mutate(a.id)} disabled={remove.isPending}
                    className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50">Remove</button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
