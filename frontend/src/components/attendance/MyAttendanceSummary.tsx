"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { myAttendanceApi } from "@/lib/attendance";

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

const inputCls =
  "rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-900/50";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hm = (v: string | null) =>
  v ? new Date(v).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hour12: false }) : "—";

export function MyAttendanceSummary({ employeeName }: { employeeName: string }) {
  const initial = useMemo(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: ymd(first), to: ymd(last) };
  }, []);

  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  // The period the user actually generated a report for (null until they click).
  const [generated, setGenerated] = useState<{ from: string; to: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["my-attendance-summary", generated?.from, generated?.to],
    queryFn: () => myAttendanceApi.list(generated!.from, generated!.to),
    enabled: Boolean(generated),
  });

  const records = useMemo(() => data?.data ?? [], [data]);
  const sorted = useMemo(
    () => [...records].sort((a, b) => a.work_date.localeCompare(b.work_date)),
    [records],
  );

  const totals = useMemo(() => {
    let hours = 0,
      otMin = 0,
      lateMin = 0,
      utMin = 0,
      workedDays = 0;
    for (const r of records) {
      const h = Number(r.hours_worked) || 0;
      hours += h;
      otMin += r.overtime_minutes || 0;
      lateMin += r.late_minutes || 0;
      utMin += r.undertime_minutes || 0;
      if (h > 0) workedDays += 1;
    }
    return { hours, otMin, lateMin, utMin, workedDays };
  }, [records]);

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-600">From</label>
          <input type="date" className={inputCls} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-600">To</label>
          <input type="date" className={inputCls} value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button
          type="button"
          onClick={() => {
            setFrom(initial.from);
            setTo(initial.to);
          }}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
        >
          This month
        </button>
        <button
          type="button"
          onClick={() => setGenerated({ from, to })}
          disabled={!from || !to}
          className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Generate report
        </button>
      </div>

      {/* Report — only after the user generates it */}
      {!generated ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-8 text-center text-sm text-slate-500">
          Choose a period and click <span className="font-medium text-slate-700">Generate report</span>.
        </p>
      ) : isLoading ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">Generating report…</p>
      ) : sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-8 text-center text-sm text-slate-500">
          No attendance records for {generated.from} to {generated.to}.
        </p>
      ) : (
        <div>
          <p className="mb-3 text-sm text-slate-500">
            Report for <span className="font-medium text-slate-700">{generated.from}</span> to{" "}
            <span className="font-medium text-slate-700">{generated.to}</span>
          </p>
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">Name</th>
                  <th className="px-3 py-2.5">Day</th>
                  <th className="px-3 py-2.5">Shift type</th>
                  <th className="px-3 py-2.5">Shift</th>
                  <th className="px-3 py-2.5">Biologs</th>
                  <th className="px-3 py-2.5 text-right">Late</th>
                  <th className="px-3 py-2.5 text-right">Undertime</th>
                  <th className="px-3 py-2.5 text-right">Total hrs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map((r) => {
                  const weekday = WEEKDAYS[new Date(r.work_date + "T00:00:00").getDay()];
                  const shiftType = r.is_adjusted
                    ? "Adjusted"
                    : r.holiday_type
                      ? r.holiday_name ?? "Holiday"
                      : r.is_rest_day
                        ? "Rest day"
                        : r.is_on_leave
                          ? "On leave"
                          : "Regular";
                  const shift = r.scheduled_in && r.scheduled_out
                    ? `${r.scheduled_in.slice(0, 5)}–${r.scheduled_out.slice(0, 5)}`
                    : "—";
                  const biologs = r.actual_in || r.actual_out ? `${hm(r.actual_in)} – ${hm(r.actual_out)}` : "—";
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/70">
                      <td className="px-3 py-2 font-medium text-slate-800">{employeeName}</td>
                      <td className="px-3 py-2 text-slate-600">
                        <span className="font-mono text-xs">{r.work_date}</span>
                        <span className="ml-1 text-xs text-slate-400">{weekday}</span>
                      </td>
                      <td className="px-3 py-2">
                        {r.is_adjusted ? (
                          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">Adjusted</span>
                        ) : (
                          <span className="text-slate-700">{shiftType}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-600">{shift}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-600">{biologs}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{r.late_minutes ? `${r.late_minutes}m` : "—"}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{r.undertime_minutes ? `${r.undertime_minutes}m` : "—"}</td>
                      <td className="px-3 py-2 text-right font-medium text-slate-800">{r.hours_worked}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-800">
                <tr>
                  <td className="px-3 py-2.5" colSpan={5}>
                    Totals — {totals.workedDays} day(s) worked
                  </td>
                  <td className="px-3 py-2.5 text-right">{totals.lateMin}m</td>
                  <td className="px-3 py-2.5 text-right">{totals.utMin}m</td>
                  <td className="px-3 py-2.5 text-right">{totals.hours.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
