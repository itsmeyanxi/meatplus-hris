"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { getMe } from "@/lib/auth";
import { myAttendanceApi, holidaysApi, type DailyTimeRecord } from "@/lib/attendance";
import { leaveBalancesApi, leaveAppsApi } from "@/lib/leaves";
import {
  overtimeApi,
  undertimeApi,
  officialBusinessApi,
  certificateOfAttendanceApi,
  correctionsApi,
} from "@/lib/approvals";
import { PageHeader } from "@/components/ui";

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

const hm = (v: string | null | undefined) => (v ? v.slice(0, 5) : null);
const hmTs = (v: string | null | undefined) => (v ? v.slice(11, 16) : null);

// "2026-06-11 17:02:00" -> "05:02 PM"
function to12h(ts: string): string {
  const hhmm = ts.slice(11, 16);
  let h = Number(hhmm.slice(0, 2));
  const m = hhmm.slice(3, 5);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${String(h).padStart(2, "0")}:${m} ${ap}`;
}

// "2026-06-11" -> "06/11/26"
function mdy(workDate: string): string {
  const [y, m, d] = workDate.split("-");
  return `${m}/${d}/${y.slice(2)}`;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type PunchEvent = { id: string; date: string; dir: "IN" | "OUT"; ts: string };

export default function DashboardPage() {
  const today = useMemo(() => new Date(), []);
  const todayStr = ymd(today);

  const monthRange = useMemo(() => {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { from: ymd(first), to: ymd(last) };
  }, [today]);

  const yearEnd = useMemo(() => ymd(new Date(today.getFullYear(), 11, 31)), [today]);

  const [showAttSummary, setShowAttSummary] = useState(false);
  const [showPayroll, setShowPayroll] = useState(false);

  const { data: meData, isLoading: meLoading } = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
  });
  const hasEmployee = Boolean(meData?.user.employee);
  const empId = meData?.user.employee?.id;

  const { data: attendance, isLoading: attLoading } = useQuery({
    queryKey: ["dash-attendance", monthRange.from, monthRange.to],
    queryFn: () => myAttendanceApi.list(monthRange.from, monthRange.to),
    enabled: hasEmployee,
  });

  const { data: balances } = useQuery({
    queryKey: ["dash-leave-balances", today.getFullYear(), empId],
    queryFn: () => leaveBalancesApi.list({ year: today.getFullYear(), employee_id: empId }),
    enabled: Boolean(empId),
  });

  const { data: pendingCount } = useQuery({
    queryKey: ["dash-pending", empId],
    queryFn: async () => {
      const lists = await Promise.all([
        leaveAppsApi.list({ status: "pending", employee_id: empId }),
        overtimeApi.list({ status: "pending", employee_id: empId }),
        undertimeApi.list({ status: "pending", employee_id: empId }),
        officialBusinessApi.list({ status: "pending", employee_id: empId }),
        certificateOfAttendanceApi.list({ status: "pending", employee_id: empId }),
        correctionsApi.list({ status: "pending", employee_id: empId }),
      ]);
      return lists.reduce((n, l) => n + l.length, 0);
    },
    enabled: Boolean(empId),
  });

  const { data: holidays } = useQuery({
    queryKey: ["dash-holidays", todayStr, yearEnd],
    queryFn: () => holidaysApi.list({ from: todayStr, to: yearEnd }),
  });

  const logRange = useMemo(() => {
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30);
    return { from: ymd(start), to: todayStr };
  }, [today, todayStr]);

  const { data: logData } = useQuery({
    queryKey: ["dash-attlog", logRange.from, logRange.to],
    queryFn: () => myAttendanceApi.list(logRange.from, logRange.to),
    enabled: hasEmployee,
  });

  if (meLoading || !meData) {
    return <div className="p-8 text-center text-slate-500">Loading dashboard…</div>;
  }

  const { user } = meData;
  const summary = attendance?.summary;
  const todayRecord = attendance?.data.find((r) => r.work_date === todayStr) ?? null;

  const upcomingHolidays = (holidays ?? [])
    .filter((h) => h.holiday_date >= todayStr)
    .sort((a, b) => a.holiday_date.localeCompare(b.holiday_date))
    .slice(0, 4);

  // Each clock in/out as its own row, most recent first.
  const events: PunchEvent[] = (logData?.data ?? [])
    .flatMap((r) => {
      const out: PunchEvent[] = [];
      if (r.actual_out) out.push({ id: `${r.id}-out`, date: r.work_date, dir: "OUT", ts: r.actual_out });
      if (r.actual_in) out.push({ id: `${r.id}-in`, date: r.work_date, dir: "IN", ts: r.actual_in });
      return out;
    })
    .sort((a, b) => b.ts.localeCompare(a.ts));

  return (
    <div className="space-y-4" style={{ zoom: 0.85 } as React.CSSProperties}>
      <PageHeader
        title="Dashboard"
        description={`Welcome back, ${user.name || "User"}. Here is your overview.`}
      />

      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-slate-900 px-6 py-5 text-white shadow-xl sm:px-8">
        <div className="relative z-10">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {MONTHS[today.getMonth()]} {today.getDate()}, {today.getFullYear()}
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
            Hello, {user.employee?.full_name || user.name || "there"}
          </h2>
          <p className="mt-2 max-w-xl text-sm text-slate-300">
            {hasEmployee
              ? "Here's your attendance and leave at a glance."
              : "Manage your account and request access from one central place."}
          </p>
        </div>
        <div className="absolute -right-12 -top-12 h-64 w-64 rounded-full bg-slate-800 opacity-50" />
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {/* Attendance — every clock in / out */}
        <Panel>
          <CardHeader icon={<CalendarIcon />} title="Attendance" />
          {!hasEmployee ? (
            <EmptyNote>No employee profile is linked to this account.</EmptyNote>
          ) : events.length === 0 ? (
            <EmptyNote>No clock in/out records in the last 30 days.</EmptyNote>
          ) : (
            <div className="-mx-1.5 max-h-72 space-y-0.5 overflow-y-auto px-1.5">
              {events.map((e) => (
                <div
                  key={e.id}
                  className="grid grid-cols-3 items-center rounded-lg px-2.5 py-1.5 text-[13px] transition hover:bg-slate-50"
                >
                  <span className="text-sm text-slate-500">{mdy(e.date)}</span>
                  <span className="justify-self-center">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        e.dir === "IN"
                          ? "bg-sky-50 text-sky-700"
                          : "bg-orange-50 text-orange-600"
                      }`}
                    >
                      {e.dir}
                    </span>
                  </span>
                  <span className="justify-self-end font-mono text-sm font-medium tabular-nums text-slate-800">
                    {to12h(e.ts)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {hasEmployee && (
            <div className="mt-3 border-t border-slate-100 pt-3 text-center">
              <Link
                href="/my-attendance"
                className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
              >
                View full attendance →
              </Link>
            </div>
          )}
        </Panel>

        {/* My stuff */}
        <Panel>
          <CardHeader icon={<FolderIcon />} title="My stuff" />

          <div className="space-y-4">
            {/* Pending Requests */}
            <div>
              <SectionLabel>Pending Requests</SectionLabel>
              {!hasEmployee ? (
                <p className="text-sm text-slate-400">—</p>
              ) : (pendingCount ?? 0) === 0 ? (
                <p className="text-sm text-slate-500">You have no pending applications 🎉</p>
              ) : (
                <Link
                  href="/my-attendance"
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 transition hover:bg-amber-100"
                >
                  <span className="text-base font-bold">{pendingCount}</span>
                  pending application(s)
                </Link>
              )}
            </div>

            {/* Leave Credits */}
            <div className="border-t border-slate-100 pt-3">
              <SectionLabel>Leave Credits</SectionLabel>
              {!balances || balances.length === 0 ? (
                <p className="text-sm text-slate-500">No leave credits on record.</p>
              ) : (
                <ul className="divide-y divide-slate-50">
                  {balances.map((b) => (
                    <li key={b.id} className="flex items-center justify-between py-1.5 text-sm">
                      <span className="text-slate-600">{b.leave_type.name}</span>
                      <span className="min-w-[2.5rem] rounded-md bg-slate-50 px-2 py-0.5 text-center font-semibold tabular-nums text-slate-800">
                        {b.current_balance}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Attendance Summary (collapsible) */}
            <CollapsibleSection
              title="Attendance Summary"
              open={showAttSummary}
              onToggle={() => setShowAttSummary((v) => !v)}
            >
              {summary ? (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label="Present" value={summary.present} />
                  <Stat label="Late" value={summary.late} />
                  <Stat label="Absent" value={summary.absent} />
                  <Stat label="On leave" value={summary.leave} />
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">No attendance data this month.</p>
              )}
            </CollapsibleSection>

            {/* Payroll (collapsible) */}
            <CollapsibleSection
              title="Payroll"
              open={showPayroll}
              onToggle={() => setShowPayroll((v) => !v)}
            >
              <p className="mt-2 text-sm text-slate-500">Payroll is not available yet.</p>
            </CollapsibleSection>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {hasEmployee && (
          <Panel className="lg:col-span-2">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Today</h3>
            <TodaySnapshot record={todayRecord} loading={attLoading} />
          </Panel>
        )}

        <Panel className={hasEmployee ? "" : "lg:col-span-3"}>
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Upcoming holidays</h3>
          {upcomingHolidays.length === 0 ? (
            <p className="text-sm text-slate-500">No upcoming holidays this year.</p>
          ) : (
            <ul className={hasEmployee ? "space-y-2.5" : "grid gap-2.5 sm:grid-cols-2"}>
              {upcomingHolidays.map((h) => (
                <li key={h.id} className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                    <span className="text-[10px] font-medium uppercase leading-none">
                      {MONTHS[Number(h.holiday_date.slice(5, 7)) - 1].slice(0, 3)}
                    </span>
                    <span className="text-sm font-bold leading-tight">{h.holiday_date.slice(8, 10)}</span>
                  </div>
                  <p className="truncate text-sm font-medium text-slate-800">{h.name}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Panel({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <section
      className={`rounded-xl border border-slate-200 bg-white/90 p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}
    >
      {children}
    </section>
  );
}

function CardHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-white">
        {icon}
      </span>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</h4>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-400">{children}</p>;
}

function CollapsibleSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-slate-100 pt-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</span>
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50">
          <EyeIcon />
          {open ? "Hide" : "Show"}
        </span>
      </button>
      {open && children}
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-center">
      <p className="text-base font-bold text-slate-800">{value}</p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  );
}

function TodaySnapshot({ record, loading }: { record: DailyTimeRecord | null; loading: boolean }) {
  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!record) return <p className="text-sm text-slate-500">No schedule or record for today.</p>;

  if (record.holiday_type) {
    return (
      <Banner tone="violet" title="Holiday" subtitle={record.holiday_name ?? "Holiday"} />
    );
  }
  if (record.is_rest_day) {
    return <Banner tone="slate" title="Rest day" subtitle="Enjoy your day off." />;
  }
  if (record.is_on_leave) {
    return <Banner tone="sky" title="On leave" subtitle="You're on approved leave today." />;
  }

  const shift =
    hm(record.scheduled_in) && hm(record.scheduled_out)
      ? `${hm(record.scheduled_in)} – ${hm(record.scheduled_out)}`
      : "—";
  const clockIn = hmTs(record.actual_in);
  const clockOut = hmTs(record.actual_out);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Field label="Shift">{shift}</Field>
        <Field label="Clock in">{clockIn ?? <span className="text-slate-400">Not yet</span>}</Field>
        <Field label="Clock out">{clockOut ?? <span className="text-slate-400">Not yet</span>}</Field>
        <Field label="Hours">{record.hours_worked}</Field>
      </div>
      <div className="flex flex-wrap gap-2">
        {record.late_minutes > 0 && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
            Late {record.late_minutes}m
          </span>
        )}
        {record.undertime_minutes > 0 && (
          <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-800">
            Undertime {record.undertime_minutes}m
          </span>
        )}
        {record.overtime_minutes > 0 && (
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
            OT {record.overtime_minutes}m
          </span>
        )}
        {record.is_adjusted && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
            Adjusted shift
          </span>
        )}
        {!clockIn && record.late_minutes === 0 && (
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
            Awaiting clock-in
          </span>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-semibold text-slate-800">{children}</p>
    </div>
  );
}

function Banner({
  tone,
  title,
  subtitle,
}: {
  tone: "violet" | "slate" | "sky";
  title: string;
  subtitle: string;
}) {
  const tones: Record<string, string> = {
    violet: "bg-violet-50 text-violet-800",
    slate: "bg-slate-50 text-slate-700",
    sky: "bg-sky-50 text-sky-800",
  };
  return (
    <div className={`rounded-xl px-4 py-3 ${tones[tone]}`}>
      <p className="text-base font-semibold">{title}</p>
      <p className="mt-0.5 text-sm opacity-80">{subtitle}</p>
    </div>
  );
}
