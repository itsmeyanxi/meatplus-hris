"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getMe } from "@/lib/auth";
import {
  myAttendanceApi,
  type DailyTimeRecord,
  type DayStatus,
} from "@/lib/attendance";
import { AppCard, PageHeader } from "@/components/ui";

const STATUS_STYLE: Record<DayStatus, { dot: string; cell: string; label: string }> = {
  present: { dot: "bg-emerald-500", cell: "bg-emerald-50 border-emerald-200", label: "Present" },
  late: { dot: "bg-amber-500", cell: "bg-amber-50 border-amber-200", label: "Late" },
  absent: { dot: "bg-red-500", cell: "bg-red-50 border-red-200", label: "Absent" },
  leave: { dot: "bg-indigo-500", cell: "bg-indigo-50 border-indigo-200", label: "On leave" },
  holiday: { dot: "bg-violet-500", cell: "bg-violet-50 border-violet-200", label: "Holiday" },
  rest_day: { dot: "bg-slate-400", cell: "bg-slate-50 border-slate-200", label: "Rest day" },
  no_record: { dot: "bg-slate-200", cell: "bg-white border-slate-200", label: "No record" },
};

const SUMMARY_KEYS: DayStatus[] = ["present", "late", "absent", "leave"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export default function MyAttendancePage() {
  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
  });
  const hasEmployee = Boolean(me?.user.employee);

  // Fetch the last ~12 months once; page through months client-side.
  const today = useMemo(() => new Date(), []);
  const range = useMemo(() => {
    const from = new Date(today.getFullYear(), today.getMonth() - 12, 1);
    return { from: ymd(from), to: ymd(today) };
  }, [today]);

  const { data, isLoading } = useQuery({
    queryKey: ["my-attendance", range.from, range.to],
    queryFn: () => myAttendanceApi.list(range.from, range.to),
    enabled: hasEmployee,
  });

  const byDate = useMemo(() => {
    const map = new Map<string, DailyTimeRecord>();
    for (const r of data?.data ?? []) map.set(r.work_date, r);
    return map;
  }, [data]);

  // Default the visible month to the latest month that has records.
  const latestMonth = useMemo(() => {
    const records = data?.data ?? [];
    if (records.length === 0) return { year: today.getFullYear(), month: today.getMonth() };
    const last = records[records.length - 1].work_date;
    const [y, m] = last.split("-").map(Number);
    return { year: y, month: m - 1 };
  }, [data, today]);

  const [view, setView] = useState<{ year: number; month: number } | null>(null);
  const cur = view ?? latestMonth;

  const monthLabel = new Date(cur.year, cur.month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const cells = useMemo(() => {
    const firstWeekday = new Date(cur.year, cur.month, 1).getDay();
    const daysInMonth = new Date(cur.year, cur.month + 1, 0).getDate();
    const out: (DailyTimeRecord | null | "blank")[] = [];
    for (let i = 0; i < firstWeekday; i++) out.push("blank");
    for (let d = 1; d <= daysInMonth; d++) {
      const key = ymd(new Date(cur.year, cur.month, d));
      out.push(byDate.get(key) ?? null);
    }
    return out;
  }, [cur, byDate]);

  const summary = useMemo(() => {
    const counts: Record<string, number> = { present: 0, late: 0, absent: 0, leave: 0, holiday: 0, rest_day: 0 };
    const daysInMonth = new Date(cur.year, cur.month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const rec = byDate.get(ymd(new Date(cur.year, cur.month, d)));
      if (rec?.day_status && rec.day_status in counts) counts[rec.day_status]++;
    }
    return counts;
  }, [cur, byDate]);

  const shift = (delta: number) => {
    const d = new Date(cur.year, cur.month + delta, 1);
    setView({ year: d.getFullYear(), month: d.getMonth() });
  };

  if (meLoading) return <p className="text-sm text-slate-500">Loading…</p>;

  if (!hasEmployee) {
    return (
      <AppCard className="mx-auto max-w-md text-center">
        <h2 className="text-lg font-semibold text-slate-900">No employee record</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
          Your account isn&apos;t linked to an employee record, so there&apos;s no
          attendance to show. Ask HR to link your profile.
        </p>
      </AppCard>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Attendance"
        description={`Daily attendance for ${me?.user.employee?.full_name ?? "you"}.`}
      />

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {SUMMARY_KEYS.map((key) => (
          <div
            key={key}
            className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur"
          >
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${STATUS_STYLE[key].dot}`} />
              <p className="text-xs font-medium text-slate-500">
                {STATUS_STYLE[key].label}
              </p>
            </div>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {summary[key]}
            </p>
          </div>
        ))}
      </div>

      {/* Calendar */}
      <div className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">{monthLabel}</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => shift(-1)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50"
              aria-label="Previous month"
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => setView(null)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Latest
            </button>
            <button
              type="button"
              onClick={() => shift(1)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50"
              aria-label="Next month"
            >
              →
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map((w) => (
            <div key={w} className="pb-1 text-center text-xs font-medium text-slate-400">
              {w}
            </div>
          ))}
          {cells.map((cell, i) => {
            if (cell === "blank") return <div key={`b${i}`} />;
            const dayNum = i - cells.findIndex((c) => c !== "blank") + 1;
            const status: DayStatus = cell?.day_status ?? "no_record";
            const style = STATUS_STYLE[status];
            return (
              <div
                key={i}
                title={cell ? `${cell.work_date} — ${style.label}` : style.label}
                className={`flex min-h-[64px] flex-col rounded-lg border p-1.5 ${style.cell}`}
              >
                <span className="text-xs font-medium text-slate-500">{dayNum}</span>
                {cell && (
                  <span className="mt-auto truncate text-[11px] font-medium text-slate-600">
                    {style.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-100 pt-4">
          {(Object.keys(STATUS_STYLE) as DayStatus[])
            .filter((k) => k !== "no_record")
            .map((k) => (
              <div key={k} className="flex items-center gap-1.5 text-xs text-slate-600">
                <span className={`h-2.5 w-2.5 rounded-full ${STATUS_STYLE[k].dot}`} />
                {STATUS_STYLE[k].label}
              </div>
            ))}
        </div>

        {isLoading && (
          <p className="mt-4 text-sm text-slate-500">Loading attendance…</p>
        )}
      </div>
    </div>
  );
}
