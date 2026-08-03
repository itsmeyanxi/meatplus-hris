"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getMe } from "@/lib/auth";
import { myAttendanceApi } from "@/lib/attendance";
import { leaveAppsApi, leaveBalancesApi } from "@/lib/leaves";
import { getPendingSummary, getAdminStats } from "@/lib/dashboard";
import { payrollApi } from "@/lib/payroll";
import { ROLE_LABELS } from "@/lib/users";
import { getMyAccessRequests } from "@/lib/access-requests";
import { PageHeader } from "@/components/ui";
import { TimeClockCard } from "@/components/TimeClockCard";
import { ApprovalQuickCard } from "@/components/ApprovalCenter";

// ── Utilities ──────────────────────────────────────────────────────────────

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function to12h(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts.slice(11, 16);
  return d.toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hour12: true });
}

function mdy(workDate: string): string {
  const [y, m, d] = workDate.split("-");
  return `${m}/${d}/${y.slice(2)}`;
}

/** Minutes → a compact hours label, e.g. 90 → "1.5". */
function fmtHrs(minutes: number): string {
  const h = minutes / 60;
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * One day in the attendance feed. Unlike a raw punch list, this reflects the
 * whole day's status — so leave, OB, holiday, rest-day and OT days show up even
 * when there's no clock in/out.
 */
type AttDayStatus = "present" | "late" | "leave" | "ob" | "holiday" | "rest_day" | "absent";
type AttDay = {
  date: string;
  status: AttDayStatus;
  actualIn: string | null;
  actualOut: string | null;
  otMinutes: number;
  holidayName?: string | null;
};

// ── Role group resolver ────────────────────────────────────────────────────

type ViewGroup = "admin" | "hr" | "payroll" | "manager" | "timekeeper" | "dept_admin" | "employee";

function getViewGroup(roles: string[]): ViewGroup {
  // super_admin (top tier) and company-level admin both get the full admin dashboard,
  // as does it_admin. super_admin > admin > it_admin.
  if (roles.includes("super_admin") || roles.includes("admin") || roles.includes("it_admin")) return "admin";
  if (roles.some((r) => ["hr_admin", "hr_officer", "hr_coordinator"].includes(r))) return "hr";
  if (roles.includes("payroll_officer")) return "payroll";
  if (roles.some((r) => ["dept_head", "supervisor", "team_lead", "garahe_teamlead"].includes(r))) return "manager";
  if (roles.includes("timekeeper")) return "timekeeper";
  if (roles.some((r) => ["dept_admin", "transport_access"].includes(r))) return "dept_admin";
  return "employee";
}

// ── Types ──────────────────────────────────────────────────────────────────

type AdminStats = Awaited<ReturnType<typeof getAdminStats>>;
type PayrollRun = { id: number; name: string; period_start: string; period_end: string; status: string };

interface SharedProps {
  adminStats: AdminStats | undefined;
  perms: string[];
}

interface PersonalProps {
  feed: AttDay[];
  summary:
    | { present: number; late: number; absent: number; leave: number; ob: number; overtime_minutes: number }
    | undefined;
  balances: { id: number; leave_type: { name: string }; current_balance: number }[] | undefined;
  pendingCount: number | undefined;
  monthLabel: string;
  hasEmployee: boolean;
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const today = useMemo(() => new Date(), []);
  const todayStr = ymd(today);

  const monthRange = useMemo(() => {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { from: ymd(first), to: ymd(last) };
  }, [today]);

  // Honour the it_admin "view as role" preview so the dashboard content matches
  // the previewed role — e.g. previewing as an employee shows the employee
  // dashboard (no org-wide admin stats), not the admin one.
  const [previewRole, setPreviewRole] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem("previewRole") : null,
  );
  useEffect(() => {
    const handler = (e: Event) => setPreviewRole((e as CustomEvent<string | null>).detail);
    window.addEventListener("preview-role-change", handler);
    return () => window.removeEventListener("preview-role-change", handler);
  }, []);

  const { data: meData, isLoading: meLoading } = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
  });

  const user = meData?.user;
  const perms = user?.permissions ?? [];
  const roles = user?.roles ?? [];
  const hasEmployee = Boolean(user?.employee);
  const empId = user?.employee?.id;

  // Previewing is an it_admin-only tool; only then does previewRole take effect.
  const isItAdmin = roles.includes("it_admin");
  const viewGroup = useMemo(
    () => getViewGroup(isItAdmin && previewRole ? [previewRole] : roles),
    [roles, previewRole, isItAdmin],
  );

  const needsAdminStats = ["admin", "hr", "payroll", "manager", "dept_admin"].includes(viewGroup);
  const needsPayroll = ["admin", "payroll"].includes(viewGroup);

  const { data: adminStats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: getAdminStats,
    enabled: needsAdminStats,
    staleTime: 2 * 60_000,
  });

  const { data: payrollRuns } = useQuery({
    queryKey: ["dash-payroll-runs"],
    queryFn: () => payrollApi.listRuns(),
    enabled: needsPayroll,
    staleTime: 5 * 60_000,
  });

  const { data: attendance } = useQuery({
    queryKey: ["dash-attendance", monthRange.from, monthRange.to],
    queryFn: () => myAttendanceApi.list(monthRange.from, monthRange.to),
    enabled: hasEmployee,
  });

  const { data: balances } = useQuery({
    queryKey: ["dash-leave-balances", today.getFullYear(), empId],
    queryFn: () => leaveBalancesApi.list({ year: today.getFullYear(), employee_id: empId }),
    enabled: Boolean(empId),
  });

  const { data: pending } = useQuery({
    queryKey: ["dash-pending", empId],
    queryFn: getPendingSummary,
    enabled: Boolean(empId),
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

  if (meLoading || !meData || !user) {
    return <div className="p-8 text-center text-slate-500">Loading dashboard…</div>;
  }

  const summary = attendance?.summary;

  // Build a per-day feed so leave / OB / holiday / rest-day / OT are all reflected —
  // not just days that happen to have a raw clock in/out punch.
  const obDates = new Set(logData?.ob_dates ?? []);
  const feed: AttDay[] = (logData?.data ?? [])
    .map((r): AttDay | null => {
      const hours = Number(r.hours_worked) || 0;
      let status: AttDayStatus;
      if (r.is_on_leave) status = "leave";
      else if (obDates.has(r.work_date)) status = "ob";
      else if (r.is_absent) status = "absent";
      else if (r.holiday_type && hours === 0) status = "holiday";
      else if (r.is_rest_day && hours === 0) status = "rest_day";
      else if (r.late_minutes > 0) status = "late";
      else if (hours > 0 || r.actual_in) status = "present";
      else return null; // nothing happened this day — skip it
      return {
        date: r.work_date,
        status,
        actualIn: r.actual_in,
        actualOut: r.actual_out,
        otMinutes: r.overtime_minutes ?? 0,
        holidayName: r.holiday_name,
      };
    })
    .filter((d): d is AttDay => d !== null)
    .sort((a, b) => b.date.localeCompare(a.date));

  const recentRuns = (payrollRuns ?? []).slice().reverse().slice(0, 5);

  const roleLabels = roles.map(
    (r) => ROLE_LABELS[r as keyof typeof ROLE_LABELS] ?? r.replace(/_/g, " "),
  );

  const VIEW_SUBTITLES: Record<ViewGroup, string> = {
    admin:      "Full system overview — manage employees, approvals, and payroll.",
    hr:         "People operations — headcount, access requests, and leave management.",
    payroll:    "Payroll management — run, review, and approve pay cycles.",
    manager:    "Team oversight — review pending approvals and your team's attendance.",
    timekeeper: "Attendance tools — DTR matrix, time logs, and reports.",
    dept_admin: "Department administration — employee directory and access management.",
    employee:   "Your attendance and leave at a glance.",
  };

  const personalProps: PersonalProps = {
    feed,
    summary,
    balances: balances ?? [],
    pendingCount: pending?.pending_total,
    monthLabel: MONTHS[today.getMonth()],
    hasEmployee,
  };

  const sharedProps: SharedProps = { adminStats, perms };

  return (
    <div className="space-y-4 md:[zoom:0.95]">
      <PageHeader title="Dashboard" />

      {/* ── Hero (always shown) ── */}
      <section className="relative overflow-hidden rounded-3xl bg-slate-900 px-4 py-5 text-white shadow-xl sm:px-8">
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {MONTHS[today.getMonth()]} {today.getDate()}, {today.getFullYear()}
            </p>
            <h2 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
              Hello, {user.employee?.full_name || user.name || "there"}
            </h2>
            {roleLabels.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {roleLabels.slice(0, 3).map((label) => (
                  <span
                    key={label}
                    className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-slate-300 ring-1 ring-white/20"
                  >
                    {label}
                  </span>
                ))}
                {roleLabels.length > 3 && (
                  <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-slate-300 ring-1 ring-white/20">
                    +{roleLabels.length - 3} more
                  </span>
                )}
              </div>
            )}
            <p className="mt-2 max-w-xl text-sm text-slate-300">{VIEW_SUBTITLES[viewGroup]}</p>
          </div>
          <LiveClock />
        </div>
        <div className="absolute -right-12 -top-12 h-64 w-64 rounded-full bg-slate-800 opacity-50" />
      </section>

      {/* ── Web time clock (anyone linked to an employee record) ── */}
      {hasEmployee && <TimeClockCard />}

      {/* ── Quick access: requests awaiting my approval (hidden when none) ── */}
      <ApprovalQuickCard />

      {/* ── Role-specific views ── */}
      {viewGroup === "admin"      && <AdminView      {...sharedProps} payrollRuns={recentRuns} personal={personalProps} />}
      {viewGroup === "hr"         && <HRView         {...sharedProps} personal={personalProps} />}
      {viewGroup === "payroll"    && <PayrollView    {...sharedProps} payrollRuns={recentRuns} personal={personalProps} />}
      {viewGroup === "manager"    && <ManagerView    {...sharedProps} personal={personalProps} />}
      {viewGroup === "timekeeper" && <TimekeeperView              personal={personalProps} />}
      {viewGroup === "dept_admin" && <DeptAdminView  {...sharedProps} personal={personalProps} />}
      {viewGroup === "employee"   && <EmployeeView                   personal={personalProps} />}
    </div>
  );
}

// ── View: IT Admin ─────────────────────────────────────────────────────────
// Full command centre — all stats, all queues, all manage links.

function AdminView({
  adminStats, perms, payrollRuns, personal,
}: SharedProps & { payrollRuns: PayrollRun[]; personal: PersonalProps }) {
  return (
    <>
      {/* Stats strip */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total headcount"  value={adminStats?.headcount     ?? null} href="/employees?active=1" color="slate"   icon={<PeopleIcon />} />
        <StatCard label="No portal access" value={adminStats?.no_access      ?? null} href="/employees"         color="amber"   icon={<ShieldIcon />} />
        <StatCard label="Pending leaves"   value={adminStats?.pending_leaves ?? null} href="/leaves"            color="sky"     icon={<LeafIcon />} />
        <StatCard label="Present today"    value={adminStats?.today_present  ?? null} href="/attendance/dtr"    color="emerald" icon={<ClockIcon />} />
      </section>

      {/* Approval queues */}
      <section>
        <SectionHeading>Approval Queues</SectionHeading>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <QueueCard href="/leaves"          title="Leave Requests"      count={adminStats?.pending_leaves          ?? null} color="sky"    icon={<LeafIcon />}   />
          <QueueCard href="/attendance"      title="Attendance Requests" count={adminStats?.pending_attendance      ?? null} color="indigo" icon={<ClockIcon />}  />
          <QueueCard href="/access-requests" title="Access Requests"     count={adminStats?.pending_access_requests ?? null} color="violet" icon={<ShieldIcon />} />
        </div>
      </section>

      {/* Quick access — one row of jump-links to every area (easy navigation) */}
      <section>
        <SectionHeading>Quick Access</SectionHeading>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <QuickTile href="/employees"       label="Employees"       icon={<PeopleIcon />} />
          <QuickTile href="/attendance"      label="Attendance"      icon={<ClockIcon />} />
          <QuickTile href="/attendance/dtr"  label="DTR Matrix"      icon={<CalendarIcon />} />
          <QuickTile href="/leaves"          label="Leaves"          icon={<LeafIcon />} />
          <QuickTile href="/payroll"         label="Payroll"         icon={<PayrollIcon />} />
          <QuickTile href="/access-requests" label="Access Requests" icon={<ShieldIcon />} />
          <QuickTile href="/users"           label="Users"           icon={<PeopleIcon />} />
          <QuickTile href="/reports"         label="Reports"         icon={<ChartIcon />} />
        </div>
      </section>

      {/* Personal attendance (shown when admin account is linked to an employee record) */}
      {personal.hasEmployee && (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <AttendanceLogPanel feed={personal.feed} />
          <PersonalPanel personal={personal} />
        </div>
      )}

      {/* Recent payroll runs */}
      <Panel>
        <CardHeader icon={<PayrollIcon />} title="Recent Payroll Runs" action={
          <Link href="/payroll" className="text-xs font-medium text-slate-500 transition hover:text-slate-800">View all →</Link>
        } />
        {payrollRuns.length === 0
          ? <EmptyNote>No payroll runs yet. <Link href="/payroll" className="text-sky-600 hover:underline">Create one</Link></EmptyNote>
          : <div className="divide-y divide-slate-100 sm:grid sm:grid-cols-2 sm:gap-x-6 sm:divide-y-0">
              {payrollRuns.map((run) => (
                <Link key={run.id} href={`/payroll/${run.id}`}
                  className="-mx-1 flex items-center justify-between rounded-lg px-1 py-2.5 transition hover:bg-slate-50">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{run.name}</p>
                    <p className="text-xs text-slate-500">{run.period_start} – {run.period_end}</p>
                  </div>
                  <RunStatusBadge status={run.status} />
                </Link>
              ))}
            </div>
        }
      </Panel>
    </>
  );
}

// ── View: HR Admin / HR Coordinator ───────────────────────────────────────
// People-first — headcount stats, access requests, leave, employees.

function HRView({ adminStats, perms, personal }: SharedProps & { personal: PersonalProps }) {
  return (
    <>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total headcount"  value={adminStats?.headcount     ?? null} href="/employees?active=1" color="slate"   icon={<PeopleIcon />} />
        <StatCard label="No portal access" value={adminStats?.no_access      ?? null} href="/employees"         color="amber"   icon={<ShieldIcon />} />
        <StatCard label="Pending leaves"   value={adminStats?.pending_leaves ?? null} href="/leaves"            color="sky"     icon={<LeafIcon />} />
        <StatCard label="Present today"    value={adminStats?.today_present  ?? null} href="/attendance/dtr"    color="emerald" icon={<ClockIcon />} />
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <ActionTile
          href="/access-requests"
          icon={<ShieldIcon />}
          title="Access Requests"
          sub="Review and approve employee system access"
          color="violet"
        />
        <ActionTile
          href="/employees"
          icon={<PeopleIcon />}
          title="Employees"
          sub="View and manage the employee directory"
          color="sky"
        />
        <ActionTile
          href="/leaves"
          icon={<LeafIcon />}
          title="Leave Requests"
          sub="Pending leave applications"
          color="emerald"
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel>
          <CardHeader icon={<FolderIcon />} title="HR Tools" />
          <div className="grid grid-cols-2 gap-2">
            <QuickLink href="/employees"       label="Employees" />
            <QuickLink href="/leaves"          label="Leave Requests" />
            <QuickLink href="/access-requests" label="Access Requests" />
            <QuickLink href="/attendance/dtr"  label="DTR Matrix" />
            <QuickLink href="/reports"         label="Reports" />
          </div>
        </Panel>

        {personal.hasEmployee
          ? <PersonalPanel personal={personal} />
          : <Panel>
              <CardHeader icon={<ChartIcon />} title="Quick Reference" />
              <div className="space-y-1">
                <ManageLink href="/employees"       label="Employee directory"   sub="All employees across departments" />
                <ManageLink href="/attendance/dtr"  label="DTR matrix"           sub="Monthly attendance grid" />
                <ManageLink href="/leaves"          label="Leave management"     sub="Approve or reject leave requests" />
                <ManageLink href="/access-requests" label="Access requests"      sub="System access queue" />
              </div>
            </Panel>
        }
      </div>
    </>
  );
}

// ── View: Payroll Officer ──────────────────────────────────────────────────
// Payroll-first — runs panel is the centrepiece.

function PayrollView({
  adminStats, perms, payrollRuns, personal,
}: SharedProps & { payrollRuns: PayrollRun[]; personal: PersonalProps }) {
  return (
    <>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total headcount" value={adminStats?.headcount    ?? null} href="/employees?active=1" color="slate"   icon={<PeopleIcon />} />
        <StatCard label="Present today"   value={adminStats?.today_present ?? null} href="/attendance/dtr"    color="emerald" icon={<ClockIcon />} />
        <StatCard label="Pending leaves"  value={adminStats?.pending_leaves ?? null} href="/leaves"           color="sky"     icon={<LeafIcon />} />
        <StatCard label="No portal access" value={adminStats?.no_access   ?? null} href="/employees"          color="amber"   icon={<ShieldIcon />} />
      </section>

      <Panel>
        <CardHeader icon={<PayrollIcon />} title="Payroll Runs" action={
          <Link
            href="/payroll"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-700"
          >
            <PlusIcon /> New Run
          </Link>
        } />
        {payrollRuns.length === 0
          ? <EmptyNote>No payroll runs yet. <Link href="/payroll" className="text-sky-600 hover:underline">Create one</Link></EmptyNote>
          : <div className="divide-y divide-slate-100">
              {payrollRuns.map((run) => (
                <Link key={run.id} href={`/payroll/${run.id}`}
                  className="-mx-1 flex items-center justify-between rounded-lg px-1 py-3 transition hover:bg-slate-50">
                  <div>
                    <p className="font-medium text-slate-800">{run.name}</p>
                    <p className="text-xs text-slate-500">{run.period_start} – {run.period_end}</p>
                  </div>
                  <RunStatusBadge status={run.status} />
                </Link>
              ))}
            </div>
        }
      </Panel>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel>
          <CardHeader icon={<FolderIcon />} title="Quick Actions" />
          <div className="grid grid-cols-2 gap-2">
            <QuickLink href="/payroll"        label="Payroll Runs" />
            <QuickLink href="/employees"      label="Employees" />
            <QuickLink href="/attendance/dtr" label="DTR Matrix" />
            <QuickLink href="/reports"        label="Reports" />
          </div>
        </Panel>

        {personal.hasEmployee ? <PersonalPanel personal={personal} /> : (
          <Panel>
            <CardHeader icon={<ChartIcon />} title="References" />
            <div className="space-y-1">
              <ManageLink href="/employees"      label="Employee directory" sub="View all employees and compensation" />
              <ManageLink href="/attendance/dtr" label="DTR matrix"        sub="Attendance data for payroll computation" />
              <ManageLink href="/reports"        label="Payroll reports"   sub="Export payroll data to CSV" />
            </div>
          </Panel>
        )}
      </div>
    </>
  );
}

// ── View: Manager (dept_head, supervisor, team_lead, garahe_teamlead) ──────
// Team-first — approval queues take priority, personal attendance below.

function ManagerView({ adminStats, perms, personal }: SharedProps & { personal: PersonalProps }) {
  const canApproveLeaves = perms.includes("leave.approve.any") || perms.includes("leave.approve.self_dept");
  const canApproveAtt    = perms.includes("attendance.approve.any") || perms.includes("attendance.approve.self_dept");
  const canAccessReqs    = perms.some((p) => p.startsWith("access_request.approve"));

  return (
    <>
      {/* Approval queues — primary focus for managers */}
      <section>
        <SectionHeading>Team Approvals</SectionHeading>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {canApproveLeaves && (
            <QueueCard href="/leaves"     title="Leave Requests"      count={adminStats?.pending_leaves          ?? null} color="sky"    icon={<LeafIcon />}   />
          )}
          {canApproveAtt && (
            <QueueCard href="/attendance" title="Attendance Requests" count={adminStats?.pending_attendance      ?? null} color="indigo" icon={<ClockIcon />}  />
          )}
          {canAccessReqs && (
            <QueueCard href="/access-requests" title="Access Requests" count={adminStats?.pending_access_requests ?? null} color="violet" icon={<ShieldIcon />} />
          )}
        </div>
      </section>

      {/* Team stats */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total headcount" value={adminStats?.headcount     ?? null} href="/employees?active=1" color="slate"   icon={<PeopleIcon />} />
        <StatCard label="Present today"   value={adminStats?.today_present  ?? null} href="/attendance/dtr"    color="emerald" icon={<ClockIcon />} />
        <StatCard label="Pending leaves"  value={adminStats?.pending_leaves ?? null} href="/leaves"            color="sky"     icon={<LeafIcon />} />
        <StatCard label="No portal access" value={adminStats?.no_access    ?? null} href="/employees"          color="amber"   icon={<ShieldIcon />} />
      </section>

      {/* Personal + manage */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {personal.hasEmployee ? <AttendanceLogPanel feed={personal.feed} /> : (
          <Panel>
            <CardHeader icon={<FolderIcon />} title="Quick Actions" />
            <div className="grid grid-cols-2 gap-2">
              <QuickLink href="/employees"       label="Employees" />
              <QuickLink href="/leaves"          label="Leave Requests" />
              <QuickLink href="/attendance/dtr"  label="DTR Matrix" />
              <QuickLink href="/access-requests" label="Access Requests" />
            </div>
          </Panel>
        )}
        {personal.hasEmployee ? <PersonalPanel personal={personal} /> : (
          <Panel>
            <CardHeader icon={<ChartIcon />} title="Manage" />
            <div className="space-y-1">
              <ManageLink href="/employees"       label="Employee directory"  sub="View employees in your department" />
              <ManageLink href="/attendance/dtr"  label="DTR matrix"          sub="Monthly attendance grid" />
              <ManageLink href="/leaves"          label="Leave approvals"     sub="Pending leave requests" />
              <ManageLink href="/access-requests" label="Access requests"     sub="System access queue" />
            </div>
          </Panel>
        )}
      </div>

      {personal.hasEmployee && (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Panel>
            <CardHeader icon={<FolderIcon />} title="Quick Actions" />
            <div className="grid grid-cols-2 gap-2">
              <QuickLink href="/employees"       label="Employees" />
              <QuickLink href="/leaves"          label="Leave Requests" />
              <QuickLink href="/attendance/dtr"  label="DTR Matrix" />
              <QuickLink href="/access-requests" label="Access Requests" />
            </div>
          </Panel>
          <Panel>
            <CardHeader icon={<ChartIcon />} title="Manage" />
            <div className="space-y-1">
              <ManageLink href="/employees"       label="Employee directory"  sub="View employees in your department" />
              <ManageLink href="/attendance/dtr"  label="DTR matrix"          sub="Monthly attendance grid" />
              <ManageLink href="/leaves"          label="Leave approvals"     sub="Pending leave requests" />
              <ManageLink href="/access-requests" label="Access requests"     sub="System access queue" />
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}

// ── View: Timekeeper ───────────────────────────────────────────────────────
// Tool-first — big action tiles for the tools they use daily.

function TimekeeperView({ personal }: { personal: PersonalProps }) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ActionTile href="/attendance/dtr"  icon={<CalendarIcon />} title="DTR Matrix"    sub="Monthly attendance overview per employee"    color="sky"    />
        <ActionTile href="/attendance"      icon={<ClockIcon />}    title="Attendance Log" sub="View and manage daily time records"         color="indigo" />
        <ActionTile href="/reports"         icon={<ChartIcon />}    title="Reports"        sub="Export DTR and attendance data to CSV"      color="emerald"/>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {personal.hasEmployee
          ? <AttendanceLogPanel feed={personal.feed} />
          : <Panel>
              <CardHeader icon={<FolderIcon />} title="More Tools" />
              <div className="grid grid-cols-2 gap-2">
                <QuickLink href="/attendance/dtr" label="DTR Matrix" />
                <QuickLink href="/attendance"     label="Attendance" />
                <QuickLink href="/reports"        label="Reports" />
                <QuickLink href="/employees"      label="Employees" />
              </div>
            </Panel>
        }
        {personal.hasEmployee
          ? <PersonalPanel personal={personal} />
          : <Panel>
              <CardHeader icon={<ChartIcon />} title="References" />
              <div className="space-y-1">
                <ManageLink href="/attendance/dtr" label="DTR matrix"   sub="Monthly attendance grid for all employees" />
                <ManageLink href="/attendance"     label="Time logs"    sub="Raw clock-in / clock-out records" />
                <ManageLink href="/reports"        label="Reports"      sub="Export attendance data to CSV" />
                <ManageLink href="/employees"      label="Employees"    sub="Employee directory" />
              </div>
            </Panel>
        }
      </div>
    </>
  );
}

// ── View: Dept Admin / Transport Access ────────────────────────────────────
// Department-level admin — employee directory and basic HR tasks.

function DeptAdminView({ adminStats, perms, personal }: SharedProps & { personal: PersonalProps }) {
  return (
    <>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total headcount"  value={adminStats?.headcount     ?? null} href="/employees?active=1" color="slate"   icon={<PeopleIcon />} />
        <StatCard label="No portal access" value={adminStats?.no_access      ?? null} href="/employees"         color="amber"   icon={<ShieldIcon />} />
        <StatCard label="Present today"    value={adminStats?.today_present  ?? null} href="/attendance/dtr"    color="emerald" icon={<ClockIcon />} />
        <StatCard label="Pending leaves"   value={adminStats?.pending_leaves ?? null} href="/leaves"            color="sky"     icon={<LeafIcon />} />
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel>
          <CardHeader icon={<FolderIcon />} title="Quick Actions" />
          <div className="grid grid-cols-2 gap-2">
            <QuickLink href="/employees"       label="Employees" />
            <QuickLink href="/attendance/dtr"  label="DTR Matrix" />
            <QuickLink href="/access-requests" label="Access Requests" />
            <QuickLink href="/reports"         label="Reports" />
          </div>
        </Panel>

        {personal.hasEmployee ? <PersonalPanel personal={personal} /> : (
          <Panel>
            <CardHeader icon={<ChartIcon />} title="Manage" />
            <div className="space-y-1">
              <ManageLink href="/employees"       label="Employee directory" sub="View and manage employees" />
              <ManageLink href="/attendance/dtr"  label="DTR matrix"        sub="Monthly attendance grid" />
              <ManageLink href="/access-requests" label="Access requests"   sub="System access approval queue" />
            </div>
          </Panel>
        )}
      </div>
    </>
  );
}

// ── View: Employee / Sales Employee ───────────────────────────────────────
// Personal-only — attendance stats, log, and leave credits.

function EmployeeView({ personal }: { personal: PersonalProps }) {
  const { feed, summary, monthLabel, hasEmployee } = personal;

  if (!hasEmployee) {
    return (
      <Panel>
        <div className="py-8 text-center">
          <p className="text-sm text-slate-500">Your account is not yet linked to an employee record.</p>
          <p className="mt-1 text-xs text-slate-400">Contact HR or IT to have your account set up.</p>
        </div>
      </Panel>
    );
  }

  return (
    <>
      {/* Personal stats — the full picture for the month, not just present/late/absent */}
      <AttendanceSummaryCards summary={summary} monthLabel={monthLabel} />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <AttendanceLogPanel feed={feed} />
        <PersonalPanel personal={personal} />
      </div>

      <OngoingTicketsPanel />
      <OngoingLeavesPanel />
    </>
  );
}

// ── Shared section components ──────────────────────────────────────────────

const DAY_STATUS_META: Record<AttDayStatus, { label: string; cls: string }> = {
  present:  { label: "Present",  cls: "bg-emerald-50 text-emerald-700" },
  late:     { label: "Late",     cls: "bg-red-50 text-red-600" },
  leave:    { label: "Leave",    cls: "bg-violet-50 text-violet-700" },
  ob:       { label: "OB",       cls: "bg-sky-50 text-sky-700" },
  holiday:  { label: "Holiday",  cls: "bg-amber-50 text-amber-700" },
  rest_day: { label: "Rest day", cls: "bg-slate-100 text-slate-500" },
  absent:   { label: "Absent",   cls: "bg-red-100 text-red-700" },
};

/** Day-status feed — reflects leave / OB / holiday / rest-day / OT, not just raw punches. */
function AttendanceLogPanel({ feed }: { feed: AttDay[] }) {
  return (
    <Panel>
      <CardHeader icon={<CalendarIcon />} title="Attendance" />
      {feed.length === 0
        ? <EmptyNote>No attendance in the last 30 days.</EmptyNote>
        : <div className="-mx-1.5 max-h-72 space-y-0.5 overflow-y-auto px-1.5">
            {feed.map((d) => {
              const meta = DAY_STATUS_META[d.status];
              const hasPunch = d.status === "present" || d.status === "late";
              const timeText = hasPunch
                ? `${d.actualIn ? to12h(d.actualIn) : "—"} – ${d.actualOut ? to12h(d.actualOut) : "—"}`
                : d.status === "holiday" && d.holidayName
                  ? d.holidayName
                  : "";
              return (
                <div key={d.date}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] transition hover:bg-slate-50">
                  <span className="text-sm text-slate-500">{mdy(d.date)}</span>
                  <span className="flex items-center gap-1.5">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.cls}`}>{meta.label}</span>
                    {d.otMinutes > 0 && (
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                        +{fmtHrs(d.otMinutes)} OT
                      </span>
                    )}
                  </span>
                  <span className="justify-self-end font-mono text-sm font-medium tabular-nums text-slate-700">
                    {timeText}
                  </span>
                </div>
              );
            })}
          </div>
      }
      <div className="mt-3 border-t border-slate-100 pt-3 text-center">
        <Link href="/my-attendance" className="text-sm font-medium text-slate-600 transition hover:text-slate-900">
          View full attendance →
        </Link>
      </div>
    </Panel>
  );
}

/** Whole-month attendance breakdown: present / late / absent / leave / OB / OT. */
function AttendanceSummaryCards({
  summary, monthLabel,
}: { summary: PersonalProps["summary"]; monthLabel: string }) {
  // Keep it simple: the four everyone cares about, plus OB / OT only when the
  // employee actually has some — so a typical month shows a clean 4-card row.
  const cards: { label: string; value: number | string | null; href: string; color: "emerald" | "amber" | "red" | "violet" | "sky" | "indigo" }[] = [
    { label: `Present · ${monthLabel}`, value: summary?.present ?? null, href: "/my-attendance", color: "emerald" },
    { label: "Late",   value: summary?.late   ?? null, href: "/my-attendance", color: "amber" },
    { label: "Absent", value: summary?.absent ?? null, href: "/my-attendance", color: "red" },
    { label: "Leave",  value: summary?.leave  ?? null, href: "/my-attendance", color: "violet" },
  ];
  if ((summary?.ob ?? 0) > 0) cards.push({ label: "OB", value: summary!.ob, href: "/official-businesses", color: "sky" });
  if ((summary?.overtime_minutes ?? 0) > 0) cards.push({ label: "OT (hrs)", value: fmtHrs(summary!.overtime_minutes), href: "/overtimes", color: "indigo" });

  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((c) => (
        <EmpStatCard key={c.label} label={c.label} value={c.value} href={c.href} color={c.color} />
      ))}
    </section>
  );
}

function PersonalPanel({ personal }: { personal: PersonalProps }) {
  const { balances, pendingCount } = personal;
  const [showZeros, setShowZeros] = useState(false);

  // Dedupe by leave-type name (super_admins see every company's identical types),
  // keeping the highest balance, and surface the ones that actually have credits
  // first — the long tail of 0-balance types is collapsed behind a toggle.
  const credits = useMemo(() => {
    const byName = new Map<string, number>();
    for (const b of balances ?? []) {
      byName.set(b.leave_type.name, Math.max(byName.get(b.leave_type.name) ?? 0, b.current_balance));
    }
    return [...byName.entries()]
      .map(([name, balance]) => ({ name, balance }))
      .sort((a, b) => b.balance - a.balance);
  }, [balances]);

  const withCredit = credits.filter((c) => c.balance > 0);
  const zeroCount = credits.length - withCredit.length;
  const shown = showZeros ? credits : withCredit;

  return (
    <Panel>
      <CardHeader
        icon={<FolderIcon />}
        title="My stuff"
        action={
          <Link
            href="/leaves"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-700"
          >
            <PlusIcon /> Apply
          </Link>
        }
      />
      <div className="space-y-4">
        <div>
          <SectionLabel>Pending Requests</SectionLabel>
          {(pendingCount ?? 0) === 0
            ? <p className="text-sm text-slate-500">No pending applications 🎉</p>
            : <Link href="/my-attendance"
                className="inline-flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 transition hover:bg-amber-100">
                <span className="text-base font-bold">{pendingCount}</span>
                pending application(s)
              </Link>
          }
        </div>
        <div className="border-t border-slate-100 pt-3">
          <SectionLabel>Leave Credits</SectionLabel>
          {credits.length === 0
            ? <p className="text-sm text-slate-500">No leave credits on record.</p>
            : shown.length === 0
              ? <p className="text-sm text-slate-500">No available leave credits.</p>
              : <ul className="divide-y divide-slate-50">
                  {shown.map((c) => (
                    <li key={c.name} className="flex items-center justify-between py-1.5 text-sm">
                      <span className="text-slate-600">{c.name}</span>
                      <span className={`min-w-[2.5rem] rounded-md px-2 py-0.5 text-center font-semibold tabular-nums ${
                        c.balance > 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-400"
                      }`}>
                        {c.balance}
                      </span>
                    </li>
                  ))}
                </ul>
          }
          {zeroCount > 0 && (
            <button
              type="button"
              onClick={() => setShowZeros((v) => !v)}
              className="mt-2 text-xs font-medium text-slate-500 transition hover:text-slate-800"
            >
              {showZeros ? "Hide" : `Show ${zeroCount} with no balance`}
            </button>
          )}
        </div>
      </div>
    </Panel>
  );
}

// ── UI primitives ──────────────────────────────────────────────────────────

function Panel({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white/90 p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}>
      {children}
    </section>
  );
}

function CardHeader({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-white">{icon}</span>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{children}</h2>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</h4>;
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-400">{children}</p>;
}

// ── Action tile (large clickable card with icon) ───────────────────────────

const TILE_COLORS = {
  sky:    { wrap: "border-sky-200 bg-sky-50/60 hover:bg-sky-50",       icon: "bg-sky-900 text-white",    title: "text-sky-900",  sub: "text-sky-600"  },
  indigo: { wrap: "border-indigo-200 bg-indigo-50/60 hover:bg-indigo-50", icon: "bg-indigo-900 text-white", title: "text-indigo-900", sub: "text-indigo-600" },
  emerald:{ wrap: "border-emerald-200 bg-emerald-50/60 hover:bg-emerald-50", icon: "bg-emerald-900 text-white", title: "text-emerald-900", sub: "text-emerald-600" },
  violet: { wrap: "border-violet-200 bg-violet-50/60 hover:bg-violet-50", icon: "bg-violet-900 text-white", title: "text-violet-900", sub: "text-violet-600" },
} as const;

function ActionTile({ href, icon, title, sub, color }: {
  href: string; icon: React.ReactNode; title: string; sub: string; color: keyof typeof TILE_COLORS;
}) {
  const c = TILE_COLORS[color];
  return (
    <Link href={href} className={`flex flex-col gap-3 rounded-xl border p-5 transition ${c.wrap}`}>
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${c.icon}`}>
        <span className="h-5 w-5">{icon}</span>
      </span>
      <div>
        <p className={`text-sm font-semibold ${c.title}`}>{title}</p>
        <p className={`mt-0.5 text-xs ${c.sub}`}>{sub}</p>
      </div>
      <span className={`mt-auto text-xs font-medium ${c.sub}`}>Open →</span>
    </Link>
  );
}

// ── Stat cards ─────────────────────────────────────────────────────────────

const COLOR_MAP = {
  slate:   { card: "bg-slate-50 border-slate-200",     num: "text-slate-900",   label: "text-slate-500" },
  amber:   { card: "bg-amber-50 border-amber-200",     num: "text-amber-800",   label: "text-amber-600" },
  sky:     { card: "bg-sky-50 border-sky-200",         num: "text-sky-800",     label: "text-sky-600" },
  emerald: { card: "bg-emerald-50 border-emerald-200", num: "text-emerald-800", label: "text-emerald-600" },
} as const;

function StatCard({ label, value, href, color, icon }: {
  label: string; value: number | null; href: string; color: keyof typeof COLOR_MAP; icon?: React.ReactNode;
}) {
  const c = COLOR_MAP[color];
  return (
    <Link href={href} className={`flex flex-col rounded-xl border p-4 transition hover:shadow-sm ${c.card}`}>
      <div className="flex items-start justify-between gap-2">
        <span className={`text-xs font-medium uppercase tracking-wide ${c.label}`}>{label}</span>
        {icon && <span className={`h-5 w-5 shrink-0 ${c.num} opacity-70`}>{icon}</span>}
      </div>
      <span className={`mt-1.5 text-3xl font-bold tabular-nums ${c.num}`}>
        {value === null
          ? <span className="inline-block h-8 w-12 animate-pulse rounded bg-current opacity-20" />
          : value
        }
      </span>
    </Link>
  );
}

const EMP_COLOR_MAP = {
  emerald: { card: "bg-emerald-50 border-emerald-200", num: "text-emerald-800", label: "text-emerald-600" },
  amber:   { card: "bg-amber-50 border-amber-200",     num: "text-amber-800",   label: "text-amber-600" },
  red:     { card: "bg-red-50 border-red-200",         num: "text-red-800",     label: "text-red-500" },
  sky:     { card: "bg-sky-50 border-sky-200",         num: "text-sky-800",     label: "text-sky-600" },
  violet:  { card: "bg-violet-50 border-violet-200",   num: "text-violet-800",  label: "text-violet-600" },
  indigo:  { card: "bg-indigo-50 border-indigo-200",   num: "text-indigo-800",  label: "text-indigo-600" },
} as const;

function EmpStatCard({ label, value, href, color }: {
  label: string; value: number | string | null; href: string; color: keyof typeof EMP_COLOR_MAP;
}) {
  const c = EMP_COLOR_MAP[color];
  return (
    <Link href={href} className={`flex flex-col rounded-xl border p-4 transition hover:shadow-sm ${c.card}`}>
      <span className={`text-xs font-medium uppercase tracking-wide ${c.label}`}>{label}</span>
      <span className={`mt-1.5 text-3xl font-bold tabular-nums ${c.num}`}>
        {value === null
          ? <span className="inline-block h-8 w-12 animate-pulse rounded bg-current opacity-20" />
          : value
        }
      </span>
    </Link>
  );
}

// ── Queue card ─────────────────────────────────────────────────────────────

const QUEUE_COLORS = {
  sky:    { card: "border-sky-200 bg-sky-50/70",       head: "text-sky-700",    num: "text-sky-900",    sub: "text-sky-500" },
  indigo: { card: "border-indigo-200 bg-indigo-50/70", head: "text-indigo-700", num: "text-indigo-900", sub: "text-indigo-500" },
  violet: { card: "border-violet-200 bg-violet-50/70", head: "text-violet-700", num: "text-violet-900", sub: "text-violet-500" },
} as const;

function QueueCard({ href, title, count, color, icon }: {
  href: string; title: string; count: number | null; color: keyof typeof QUEUE_COLORS; icon: React.ReactNode;
}) {
  const c = QUEUE_COLORS[color];
  return (
    <Link href={href} className={`flex flex-col gap-2 rounded-xl border p-4 transition hover:shadow-sm ${c.card}`}>
      <div className={`flex items-center gap-2 ${c.head}`}>
        <span className="h-4 w-4 shrink-0">{icon}</span>
        <span className="text-sm font-semibold">{title}</span>
      </div>
      {count !== null
        ? <div className="flex items-baseline gap-1.5">
            <span className={`text-2xl font-bold tabular-nums ${c.num}`}>{count}</span>
            <span className={`text-xs ${c.sub}`}>pending</span>
          </div>
        : <span className={`text-sm font-medium ${c.sub}`}>View queue →</span>
      }
    </Link>
  );
}

// ── Navigation helpers ─────────────────────────────────────────────────────

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href}
      className="flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-100">
      {label}
    </Link>
  );
}

/** Icon + label jump-tile for the admin Quick Access bar. */
function QuickTile({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <Link href={href}
      className="group flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-medium text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white transition group-hover:bg-brand-700">
        <span className="h-4 w-4">{icon}</span>
      </span>
      {label}
    </Link>
  );
}

function ManageLink({ href, label, sub }: { href: string; label: string; sub: string }) {
  return (
    <Link href={href}
      className="flex items-center justify-between rounded-lg px-2.5 py-2 text-sm transition hover:bg-slate-50">
      <div>
        <p className="font-medium text-slate-800">{label}</p>
        <p className="text-xs text-slate-500">{sub}</p>
      </div>
      <span className="text-slate-400">→</span>
    </Link>
  );
}

// ── Payroll run status badge ───────────────────────────────────────────────

const RUN_STATUS: Record<string, { bg: string; text: string; label: string }> = {
  draft:    { bg: "bg-slate-100",   text: "text-slate-600",   label: "Draft" },
  computed: { bg: "bg-amber-100",   text: "text-amber-700",   label: "Computed" },
  approved: { bg: "bg-sky-100",     text: "text-sky-700",     label: "Approved" },
  posted:   { bg: "bg-emerald-100", text: "text-emerald-700", label: "Posted" },
};

function RunStatusBadge({ status }: { status: string }) {
  const s = RUN_STATUS[status] ?? { bg: "bg-slate-100", text: "text-slate-600", label: status };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}>{s.label}</span>
  );
}

// ── Live clock ─────────────────────────────────────────────────────────────

function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const h = now.getHours();
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const ap = h >= 12 ? "PM" : "AM";
  const h12 = String(h % 12 || 12).padStart(2, "0");
  const weekday = now.toLocaleDateString("en-US", { weekday: "long" });

  return (
    <div className="shrink-0 text-left sm:text-right" suppressHydrationWarning>
      <div className="font-mono text-3xl font-bold tabular-nums tracking-tight sm:text-4xl">
        {h12}:{mm}
        <span className="text-lg font-semibold text-slate-400 sm:text-xl">:{ss} {ap}</span>
      </div>
      <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-slate-400">{weekday}</p>
    </div>
  );
}

// ── Ongoing access-request tickets (employee dashboard) ───────────────────

const TICKET_STAGES = ["supervisor", "hr", "it"] as const;
const TICKET_STAGE_LABEL: Record<string, string> = { supervisor: "Supervisor", hr: "HR", it: "IT" };

function OngoingTicketsPanel() {
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["my-access-requests"],
    queryFn: getMyAccessRequests,
    staleTime: 30_000,
  });

  const pending = requests.filter((r) => r.status === "pending");

  if (isLoading || pending.length === 0) return null;

  return (
    <Panel>
      <CardHeader
        icon={<TicketIcon />}
        title="Ongoing Access Requests"
        action={
          <Link href="/request-access" className="text-xs font-medium text-slate-500 transition hover:text-slate-800">
            View all →
          </Link>
        }
      />
      <div className="space-y-3">
        {pending.map((r) => {
          const currentIdx = TICKET_STAGES.indexOf(r.current_stage as typeof TICKET_STAGES[number]);
          const filed = r.submitted_at
            ? new Date(r.submitted_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
            : "—";
          const typeLabel = r.request_type
            ? r.request_type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
            : "Access request";

          return (
            <div key={r.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
              {/* Header row */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-slate-900">{r.ticket_number}</span>
                    <span className="rounded bg-slate-200/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                      {typeLabel}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">Filed {filed}</p>
                </div>
                <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                  In progress
                </span>
              </div>

              {/* Stage pipeline */}
              <div className="mt-3 flex items-center gap-1">
                {TICKET_STAGES.map((s, i) => {
                  const done   = i < currentIdx;
                  const active = i === currentIdx;
                  return (
                    <div key={s} className="flex items-center gap-1">
                      <span className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${
                        done   ? "bg-emerald-100 text-emerald-700" :
                        active ? "bg-amber-100 text-amber-800 ring-1 ring-amber-300" :
                                 "bg-slate-100 text-slate-400"
                      }`}>
                        {TICKET_STAGE_LABEL[s]}
                      </span>
                      {i < 2 && <span className="text-slate-300">›</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// ── Ongoing leave applications (employee dashboard) ───────────────────────

function OngoingLeavesPanel() {
  const { data: leaves = [], isLoading } = useQuery({
    queryKey: ["my-leave-applications", "pending"],
    queryFn: () => leaveAppsApi.list({ status: "pending" }),
    staleTime: 30_000,
  });

  if (isLoading || leaves.length === 0) return null;

  return (
    <Panel>
      <CardHeader
        icon={<LeafIcon />}
        title="Pending Leave Applications"
        action={
          <Link href="/leaves" className="text-xs font-medium text-slate-500 transition hover:text-slate-800">
            View all →
          </Link>
        }
      />
      <div className="space-y-3">
        {leaves.map((leave) => {
          const from = new Date(leave.date_from).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
          const to   = new Date(leave.date_to).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
          const days = leave.days_count;
          const dayLabel = leave.half_day
            ? `Half day (${leave.half_day.toUpperCase()})`
            : `${days} day${days !== 1 ? "s" : ""}`;

          return (
            <div key={leave.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-slate-900">{leave.leave_type.name}</span>
                    <span className="rounded bg-slate-200/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                      {leave.leave_type.code}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {from === to.slice(0, -6) ? from : `${from} – ${to}`} · {dayLabel}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                  Awaiting approval
                </span>
              </div>
              {leave.reason && (
                <p className="mt-2 line-clamp-2 text-xs text-slate-500 italic">"{leave.reason}"</p>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────

function PlusIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
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

function ChartIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function PayrollIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 8h6m-6 4h6m-7 8h8a2 2 0 002-2V6a2 2 0 00-2-2H8a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function LeafIcon() {
  return (
    <svg className="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.364l-.707-.707M14 12a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg className="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg className="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function TicketIcon() {
  return (
    <svg className="h-full w-full" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
    </svg>
  );
}
