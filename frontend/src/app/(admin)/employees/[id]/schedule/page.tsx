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

// A manually-entered weekly pattern (one entry per day of week, Sun–Sat).
type CustomDay = {
  is_rest_day: boolean;
  time_in: string;
  time_out: string;
  break_start: string;
  break_end: string;
  no_break: boolean;
};
const DEFAULT_WEEK: CustomDay[] = [0, 1, 2, 3, 4, 5, 6].map((dow) => ({
  is_rest_day: dow === 0, // Sunday rest by default; adjust as needed
  time_in: "08:00",
  time_out: "17:00",
  break_start: "12:00",
  break_end: "13:00",
  no_break: false,
}));

/** First calendar date on/after `fromStr` (YYYY-MM-DD) that falls on `dow` (0=Sun). */
function dateForDow(fromStr: string, dow: number): string {
  const base = new Date(`${fromStr}T00:00:00`);
  if (isNaN(base.getTime())) return "—";
  const delta = (dow - base.getDay() + 7) % 7;
  const d = new Date(base);
  d.setDate(base.getDate() + delta);
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

/** Minutes since midnight for an "HH:MM" string. */
function toMins(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
/** Break length (minutes) for a day, honouring rest day / no break. */
function breakMins(d: CustomDay): number {
  if (d.is_rest_day || d.no_break || !d.break_start || !d.break_end) return 0;
  return Math.max(0, toMins(d.break_end) - toMins(d.break_start));
}
/** Paid hours for a day = shift span − break, crossing midnight if needed. */
function dayHours(d: CustomDay): number {
  if (d.is_rest_day || !d.time_in || !d.time_out) return 0;
  let mins = toMins(d.time_out) - toMins(d.time_in);
  if (mins < 0) mins += 24 * 60;
  return Math.max(0, Math.round(((mins - breakMins(d)) / 60) * 10) / 10);
}

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

/** A readable one-line summary of a schedule: times · workdays · rest days · hours. */
function schedSummary(s: WorkSchedule): string {
  const days = s.days ?? [];
  const work = days.filter((d) => !d.is_rest_day);
  const rest = days.filter((d) => d.is_rest_day).map((d) => DOW[d.day_of_week]);
  if (work.length === 0) return "No working days";
  const w = work[0];
  const times = w.time_in && w.time_out ? `${t12(w.time_in)} – ${t12(w.time_out)}` : "—";
  const restStr = rest.length ? `${rest.join(", ")} rest` : "no rest day";
  const hrs = Number(w.required_hours || 0);
  return `${times} · ${s.weekly_workdays}-day week · ${restStr}${hrs ? ` · ${hrs}h/day` : ""}`;
}

/** A tiny 7-cell week strip (S M T W T F S) — teal = works, grey = rest. */
function MiniWeek({ schedule }: { schedule: WorkSchedule }) {
  const byDow = new Map((schedule.days ?? []).map((d) => [d.day_of_week, d]));
  return (
    <div className="flex shrink-0 gap-0.5">
      {[0, 1, 2, 3, 4, 5, 6].map((dow) => {
        const d = byDow.get(dow);
        const rest = !d || d.is_rest_day;
        return (
          <div
            key={dow}
            title={`${DOW[dow]}: ${rest ? "Rest day" : `${t12(d!.time_in)}–${t12(d!.time_out)}`}`}
            className={`h-5 w-5 rounded text-center text-[9px] font-bold leading-5 ${rest ? "bg-slate-100 text-slate-400" : "bg-brand-100 text-brand-700"}`}
          >
            {DOW[dow][0]}
          </div>
        );
      })}
    </div>
  );
}

export default function EmployeeSchedulePage() {
  const params = useParams<{ id: string }>();
  const employeeId = Number(params.id);
  const qc = useQueryClient();

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const perms = me?.user.permissions ?? [];
  const canManage = (me?.user.roles?.includes("super_admin") ?? false) || (me?.user.roles?.includes("it_admin") ?? false) || (me?.user.roles?.includes("admin") ?? false) || perms.includes("attendance.manage");

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
  const [schedSearch, setSchedSearch] = useState("");

  // "existing" = pick a saved schedule · "custom" = enter the week by hand.
  const [mode, setMode] = useState<"existing" | "custom">("existing");
  const [customName, setCustomName] = useState("");
  const [customDays, setCustomDays] = useState<CustomDay[]>(() => DEFAULT_WEEK.map((d) => ({ ...d })));
  const setDay = (dow: number, patch: Partial<CustomDay>) =>
    setCustomDays((ds) => ds.map((d, i) => (i === dow ? { ...d, ...patch } : d)));
  // Copy this day's shift + break onto every other working (non-rest) day.
  const copyRow = (dow: number) =>
    setCustomDays((ds) => {
      const s = ds[dow];
      return ds.map((d) =>
        d.is_rest_day ? d : { ...d, time_in: s.time_in, time_out: s.time_out, break_start: s.break_start, break_end: s.break_end, no_break: s.no_break },
      );
    });
  // Reset a row to the default working day (also un-sets rest day).
  const clearRow = (dow: number) =>
    setDay(dow, { is_rest_day: false, time_in: "08:00", time_out: "17:00", break_start: "12:00", break_end: "13:00", no_break: false });

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

  // Create a work schedule from the manually-entered week, then assign it.
  const createAssign = useMutation({
    mutationFn: async () => {
      const hhmmss = (t: string) => (t.length === 5 ? `${t}:00` : t); // API wants H:i:s
      const days = customDays.map((d, dow) => {
        const noWindow = d.is_rest_day || d.no_break || !d.break_start || !d.break_end;
        return {
          day_of_week: dow,
          is_rest_day: d.is_rest_day,
          time_in: d.is_rest_day ? null : hhmmss(d.time_in),
          time_out: d.is_rest_day ? null : hhmmss(d.time_out),
          break_start: noWindow ? null : hhmmss(d.break_start),
          break_end: noWindow ? null : hhmmss(d.break_end),
          break_minutes: breakMins(d),
          required_hours: dayHours(d),
        };
      });
      const workdays = days.filter((d) => !d.is_rest_day).length;
      const name = customName.trim() || `${emp?.first_name ?? "Employee"} ${emp?.last_name ?? ""} — custom`.trim();
      const code = `CUSTOM-${employeeId}-${Date.now().toString(36)}`;
      const sched = await workSchedulesApi.create({ code, name, weekly_workdays: workdays, is_active: true, days });
      await employeeSchedulesApi.create(employeeId, { work_schedule_id: sched.id, effective_from: from });
    },
    onSuccess: () => {
      toast.success("Custom schedule created and assigned.");
      setAdding(false);
      invalidate();
      qc.invalidateQueries({ queryKey: ["work-schedules"] });
    },
    onError: () => toast.error("Couldn't create the custom schedule."),
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
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${noPunch ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-600"}`}>
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
            <button onClick={() => setAdding((v) => !v)} className="rounded-lg bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-brand-700">
              {adding ? "Cancel" : "Change schedule"}
            </button>
          )}
        </div>

        {/* Assign form — searchable list with a readable summary + mini week per option */}
        {adding && canManage && (
          <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            {/* Pick a saved schedule, or enter one by hand */}
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-xs font-semibold">
              <button type="button" onClick={() => setMode("existing")}
                className={`rounded-md px-3 py-1.5 transition ${mode === "existing" ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>Pick existing</button>
              <button type="button" onClick={() => setMode("custom")}
                className={`rounded-md px-3 py-1.5 transition ${mode === "custom" ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>Create custom</button>
            </div>

            {mode === "existing" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">1 · Pick a work schedule</label>
              <div className="relative">
                <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
                </svg>
                <input
                  value={schedSearch}
                  onChange={(e) => setSchedSearch(e.target.value)}
                  placeholder="Search by name, time, or rest day…"
                  className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500"
                />
              </div>
              <div className="mt-2 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                {(() => {
                  const term = schedSearch.trim().toLowerCase();
                  const list = schedules
                    .filter((s) => s.is_active)
                    .filter((s) => !term || s.name.toLowerCase().includes(term) || s.code.toLowerCase().includes(term) || schedSummary(s).toLowerCase().includes(term));
                  if (list.length === 0) return <p className="px-3 py-6 text-center text-sm text-slate-400">No schedules match.</p>;
                  return list.map((s) => {
                    const active = wsId === String(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setWsId(String(s.id))}
                        className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition ${active ? "bg-brand-50 ring-1 ring-inset ring-brand-300" : "hover:bg-slate-50"}`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-800">{s.name}</span>
                            {active && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white">Selected</span>}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500">{schedSummary(s)}</div>
                        </div>
                        <MiniWeek schedule={s} />
                      </button>
                    );
                  });
                })()}
              </div>
            </div>
            )}

            {mode === "custom" && (
              <div className="space-y-2">
                <label className="mb-1 block text-xs font-medium text-slate-500">1 · Enter the weekly pattern</label>
                <input
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Schedule name (optional)"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
                />
                <p className="text-[11px] text-slate-400">Dates show the first week the schedule takes effect (from the effective date set in step 2).</p>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[840px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2.5">Day</th>
                        <th className="px-3 py-2.5">Date</th>
                        <th className="px-3 py-2.5">Shift Start</th>
                        <th className="px-3 py-2.5">Shift End</th>
                        <th className="px-3 py-2.5">Break Start</th>
                        <th className="px-3 py-2.5">Break End</th>
                        <th className="px-3 py-2.5 text-center">Rest Day</th>
                        <th className="px-3 py-2.5 text-center">No Break</th>
                        <th className="px-3 py-2.5 text-right">Hrs</th>
                        <th className="px-3 py-2.5"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {customDays.map((d, dow) => {
                        const rest = d.is_rest_day;
                        const noBreak = rest || d.no_break;
                        const timeCls = "w-28 rounded-lg border border-slate-200 px-2 py-1.5 outline-none focus:border-brand-500 disabled:bg-slate-100 disabled:text-slate-300";
                        return (
                          <tr key={dow} className={rest ? "bg-slate-50/60" : ""}>
                            <td className="px-3 py-2 font-medium text-slate-700">{DOW[dow]}</td>
                            <td className="px-3 py-2 whitespace-nowrap tabular-nums text-slate-500">{dateForDow(from, dow)}</td>
                            <td className="px-3 py-2"><input type="time" value={d.time_in} disabled={rest} onChange={(e) => setDay(dow, { time_in: e.target.value })} className={timeCls} /></td>
                            <td className="px-3 py-2"><input type="time" value={d.time_out} disabled={rest} onChange={(e) => setDay(dow, { time_out: e.target.value })} className={timeCls} /></td>
                            <td className="px-3 py-2"><input type="time" value={d.break_start} disabled={noBreak} onChange={(e) => setDay(dow, { break_start: e.target.value })} className={timeCls} /></td>
                            <td className="px-3 py-2"><input type="time" value={d.break_end} disabled={noBreak} onChange={(e) => setDay(dow, { break_end: e.target.value })} className={timeCls} /></td>
                            <td className="px-3 py-2 text-center"><input type="checkbox" checked={d.is_rest_day} onChange={(e) => setDay(dow, { is_rest_day: e.target.checked })} /></td>
                            <td className="px-3 py-2 text-center"><input type="checkbox" checked={d.no_break} disabled={rest} onChange={(e) => setDay(dow, { no_break: e.target.checked })} /></td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-500">{rest ? "—" : `${dayHours(d)}h`}</td>
                            <td className="px-3 py-2">
                              <div className="flex justify-end gap-1">
                                <button type="button" title="Copy this day to all working days" onClick={() => copyRow(dow)} disabled={rest}
                                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30">
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                                </button>
                                <button type="button" title="Reset this day" onClick={() => clearRow(dow)}
                                  className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-400"><b>No Break</b> keeps the whole shift paid; <b>Rest Day</b> means no work. The copy icon applies a day to the entire week. Creates a schedule for this employee only.</p>
              </div>
            )}

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">2 · Effective from</label>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </div>
              {mode === "existing" ? (
                <button
                  onClick={() => assign.mutate()}
                  disabled={!wsId || assign.isPending}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {assign.isPending ? "Saving…" : "Assign schedule"}
                </button>
              ) : (
                <button
                  onClick={() => createAssign.mutate()}
                  disabled={createAssign.isPending}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {createAssign.isPending ? "Creating…" : "Create & assign"}
                </button>
              )}
              <p className="text-xs text-slate-400">The new schedule applies from this date; the previous one is kept in history.</p>
            </div>
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
                  <div key={d} className={`rounded-xl border p-3 text-center ${rest ? "border-slate-100 bg-slate-50" : "border-brand-100 bg-brand-50/50"}`}>
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
