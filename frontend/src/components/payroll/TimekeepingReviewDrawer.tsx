"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { timekeepingApi, FLOATING_LABELS, type TimekeepingDay } from "@/lib/payroll";

function mins(m: number): string {
  if (!m) return "—";
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

const STATUS_STYLE: Record<string, string> = {
  "Present": "bg-emerald-50 text-emerald-700",
  "Holiday worked": "bg-emerald-50 text-emerald-700",
  "On leave": "bg-sky-50 text-sky-700",
  "Holiday": "bg-violet-50 text-violet-700",
  "Rest day": "bg-slate-100 text-slate-500",
  "Absent": "bg-rose-50 text-rose-700",
  "No record": "bg-amber-50 text-amber-700",
};

/** Slide-over: one employee's day-by-day timekeeping for the cutoff. */
export function TimekeepingReviewDrawer({
  employeeId, from, to, onClose,
}: { employeeId: number; from?: string; to?: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["timekeeping-detail", employeeId, from, to],
    queryFn: () => timekeepingApi.detail(employeeId, from, to),
  });

  const remind = useMutation({
    mutationFn: () => timekeepingApi.remind(employeeId, from, to),
    onSuccess: (res) => (res.sent > 0 ? toast.success(res.message) : toast.info(res.message)),
    onError: () => toast.error("Couldn't send the reminder."),
  });

  return (
    <div className="fixed inset-0 z-[9997] flex justify-end bg-slate-900/40" onClick={onClose}>
      <div className="h-full w-full max-w-3xl overflow-y-auto bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{data?.employee.name ?? "Loading…"}</h2>
            <p className="text-xs text-slate-500">
              {data?.employee.employee_no}
              {data?.employee.department ? ` · ${data.employee.department}` : ""}
              {data?.employee.position ? ` · ${data.employee.position}` : ""}
            </p>
            {data && <p className="mt-0.5 text-xs text-slate-400">Cutoff {data.period.from} → {data.period.to}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {isLoading || !data ? (
          <div className="p-6 text-sm text-slate-400">Loading timekeeping…</div>
        ) : (
          <div className="space-y-5 p-6">
            {/* Summary chips */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Chip label="Present" value={`${data.totals.present_days}/${data.totals.scheduled_days}`} />
              <Chip label="Absent" value={data.totals.absent_days} tone={data.totals.absent_days > 0 ? "rose" : "slate"} />
              <Chip label="Late" value={mins(data.totals.late_minutes)} tone={data.totals.late_minutes > 0 ? "amber" : "slate"} />
              <Chip label="Overtime" value={mins(data.totals.ot_minutes)} />
            </div>

            {/* Floating requests */}
            {data.floating.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-amber-900">Floating approvals ({data.floating.length})</h3>
                  {data.head && (
                    <button
                      onClick={() => remind.mutate()}
                      disabled={remind.isPending}
                      className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                    >
                      {remind.isPending ? "Sending…" : `Remind ${data.head.name}`}
                    </button>
                  )}
                </div>
                <ul className="space-y-1">
                  {data.floating.map((f) => (
                    <li key={`${f.type}-${f.id}`} className="flex items-center gap-2 text-sm text-amber-900">
                      <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium">{FLOATING_LABELS[f.type] ?? f.label}</span>
                      <span className="text-slate-600">{f.date ?? "—"}</span>
                      {f.reason && <span className="truncate text-xs text-slate-400">— {f.reason}</span>}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-amber-700">These can still change pay — clear them before running payroll.</p>
              </div>
            )}

            {/* Day-by-day table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Schedule</th>
                    <th className="px-3 py-2">Time in</th>
                    <th className="px-3 py-2">Time out</th>
                    <th className="px-3 py-2 text-right">Hours</th>
                    <th className="px-3 py-2 text-right">Late</th>
                    <th className="px-3 py-2 text-right">OT</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.days.length === 0 && (
                    <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">No daily records for this cutoff.</td></tr>
                  )}
                  {data.days.map((d) => <DayRow key={d.date} d={d} />)}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DayRow({ d }: { d: TimekeepingDay }) {
  const missing = d.status === "Present" && (!d.actual_in || !d.actual_out);
  return (
    <tr className={d.status === "Absent" ? "bg-rose-50/40" : "hover:bg-slate-50/60"}>
      <td className="px-3 py-2">
        <span className="font-medium text-slate-800">{d.date?.slice(5)}</span>
        <span className="ml-1 text-xs text-slate-400">{d.dow}</span>
      </td>
      <td className="px-3 py-2 text-xs text-slate-500">{d.scheduled_in && d.scheduled_out ? `${d.scheduled_in}–${d.scheduled_out}` : "—"}</td>
      <td className={`px-3 py-2 tabular-nums ${missing && !d.actual_in ? "text-rose-500" : "text-slate-700"}`}>{d.actual_in ?? "—"}</td>
      <td className={`px-3 py-2 tabular-nums ${missing && !d.actual_out ? "text-rose-500" : "text-slate-700"}`}>{d.actual_out ?? "—"}</td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{d.hours_worked > 0 ? d.hours_worked.toFixed(2) : "—"}</td>
      <td className="px-3 py-2 text-right tabular-nums">{d.late_minutes > 0 ? <span className="text-amber-700">{mins(d.late_minutes)}</span> : "—"}</td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{d.overtime_minutes > 0 ? mins(d.overtime_minutes) : "—"}</td>
      <td className="px-3 py-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[d.status] ?? "bg-slate-100 text-slate-500"}`}>{d.status}</span>
      </td>
    </tr>
  );
}

function Chip({ label, value, tone = "slate" }: { label: string; value: string | number; tone?: "slate" | "amber" | "rose" }) {
  const color = tone === "amber" ? "text-amber-700" : tone === "rose" ? "text-rose-600" : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-0.5 text-lg font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
