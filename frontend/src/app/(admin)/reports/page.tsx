"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui";
import { payrollApi } from "@/lib/payroll";
import {
  downloadEmployeeRoster,
  downloadDtrReport,
  downloadLeaveReport,
  downloadOvertimeReport,
  downloadPayrollReport,
} from "@/lib/reports";
import { getLookup, listEmployees } from "@/lib/employees";

const fieldCls =
  "mt-0.5 block rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900";

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Download data exports as CSV files." />
      <div className="grid gap-4 sm:grid-cols-2">
        <EmployeeRosterCard />
        <DtrReportCard />
        <LeaveReportCard />
        <OvertimeReportCard />
        <PayrollReportCard />
      </div>
    </div>
  );
}

function ReportCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <p className="mt-0.5 text-xs text-slate-500">{description}</p>
      </div>
      {children}
    </div>
  );
}

function DownloadButton({
  onClick,
  loading,
  children,
}: {
  onClick: () => void;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 transition"
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
      ) : (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      )}
      {children}
    </button>
  );
}

/** Fetches employee list on first focus of the select — avoids the request until the user opens the dropdown. */
function useLazyEmployees() {
  const [enabled, setEnabled] = useState(false);
  const { data } = useQuery({
    queryKey: ["employees-lookup"],
    queryFn: () => listEmployees({ perPage: 200 }),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
  return { employees: data?.data ?? [], load: () => setEnabled(true) };
}

// RP-2 ─────────────────────────────────────────────────────────────────────────

function EmployeeRosterCard() {
  const [departmentId, setDepartmentId] = useState<number | "">("");
  const [loading, setLoading] = useState(false);

  const { data: departments = [] } = useQuery({
    queryKey: ["lookups", "departments"],
    queryFn: () => getLookup("departments"),
    staleTime: 5 * 60 * 1000,
  });

  const download = async () => {
    setLoading(true);
    try {
      await downloadEmployeeRoster({ department_id: departmentId || undefined });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ReportCard
      title="Employee Roster"
      description="All active and inactive employees with their department, position, and employment details."
    >
      <div className="flex gap-2 flex-wrap">
        <label className="block">
          <span className="text-xs text-slate-500">Department</span>
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value ? Number(e.target.value) : "")}
            className={fieldCls}
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <DownloadButton onClick={download} loading={loading}>
        Download CSV
      </DownloadButton>
    </ReportCard>
  );
}

// RP-1 ─────────────────────────────────────────────────────────────────────────

function DtrReportCard() {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + "01";
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [employeeId, setEmployeeId] = useState<number | "">("");
  const [departmentId, setDepartmentId] = useState<number | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: departments = [] } = useQuery({
    queryKey: ["lookups", "departments"],
    queryFn: () => getLookup("departments"),
    staleTime: 5 * 60 * 1000,
  });

  const { employees, load: loadEmployees } = useLazyEmployees();

  const download = async () => {
    if (!from || !to) {
      setError("Both dates are required.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await downloadDtrReport({
        date_from: from,
        date_to: to,
        employee_id: employeeId || undefined,
        department_id: departmentId || undefined,
      });
    } catch {
      setError("Failed to download. Check your date range.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ReportCard title="DTR Report" description="Daily time records for all employees within a date range.">
      <div className="flex gap-2 flex-wrap">
        <label className="block">
          <span className="text-xs text-slate-500">From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={fieldCls}
          />
        </label>
        <label className="block">
          <span className="text-xs text-slate-500">To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={fieldCls}
          />
        </label>
        <label className="block">
          <span className="text-xs text-slate-500">Department</span>
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value ? Number(e.target.value) : "")}
            className={fieldCls}
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-slate-500">Employee</span>
          <select
            value={employeeId}
            onFocus={loadEmployees}
            onChange={(e) => setEmployeeId(e.target.value ? Number(e.target.value) : "")}
            className={fieldCls}
          >
            <option value="">All employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.full_name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <DownloadButton onClick={download} loading={loading}>
        Download CSV
      </DownloadButton>
    </ReportCard>
  );
}

// RP-3 ─────────────────────────────────────────────────────────────────────────

function LeaveReportCard() {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfYear = today.slice(0, 4) + "-01-01";
  const [from, setFrom] = useState(firstOfYear);
  const [to, setTo] = useState(today);
  const [status, setStatus] = useState("");
  const [employeeId, setEmployeeId] = useState<number | "">("");
  const [departmentId, setDepartmentId] = useState<number | "">("");
  const [loading, setLoading] = useState(false);

  const { data: departments = [] } = useQuery({
    queryKey: ["lookups", "departments"],
    queryFn: () => getLookup("departments"),
    staleTime: 5 * 60 * 1000,
  });

  const { employees, load: loadEmployees } = useLazyEmployees();

  const download = async () => {
    setLoading(true);
    try {
      await downloadLeaveReport({
        date_from: from,
        date_to: to,
        status: status || undefined,
        employee_id: employeeId || undefined,
        department_id: departmentId || undefined,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ReportCard title="Leave Report" description="Leave applications within a date range, filterable by status.">
      <div className="flex gap-2 flex-wrap">
        <label className="block">
          <span className="text-xs text-slate-500">From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={fieldCls}
          />
        </label>
        <label className="block">
          <span className="text-xs text-slate-500">To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={fieldCls}
          />
        </label>
        <label className="block">
          <span className="text-xs text-slate-500">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={fieldCls}
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-slate-500">Department</span>
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value ? Number(e.target.value) : "")}
            className={fieldCls}
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-slate-500">Employee</span>
          <select
            value={employeeId}
            onFocus={loadEmployees}
            onChange={(e) => setEmployeeId(e.target.value ? Number(e.target.value) : "")}
            className={fieldCls}
          >
            <option value="">All employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.full_name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <DownloadButton onClick={download} loading={loading}>
        Download CSV
      </DownloadButton>
    </ReportCard>
  );
}

// Overtime ─────────────────────────────────────────────────────────────────────

function OvertimeReportCard() {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 7) + "-01";
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const download = async () => {
    setLoading(true);
    try {
      await downloadOvertimeReport({ date_from: from, date_to: to, status: status || undefined });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ReportCard title="Overtime Report" description="Overtime requests within a date range, filterable by status.">
      <div className="flex gap-2 flex-wrap">
        <label className="block">
          <span className="text-xs text-slate-500">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={fieldCls} />
        </label>
        <label className="block">
          <span className="text-xs text-slate-500">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={fieldCls} />
        </label>
        <label className="block">
          <span className="text-xs text-slate-500">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={fieldCls}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
      </div>
      <DownloadButton onClick={download} loading={loading}>
        Download CSV
      </DownloadButton>
    </ReportCard>
  );
}

// Payroll ──────────────────────────────────────────────────────────────────────

function PayrollReportCard() {
  const { data: runs = [] } = useQuery({ queryKey: ["payroll-runs"], queryFn: payrollApi.listRuns });
  const [selected, setSelected] = useState<number | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    if (!selected) {
      setError("Select a payroll run first.");
      return;
    }
    setError(null);
    setLoading(true);
    const run = runs.find((r) => r.id === selected);
    try {
      await downloadPayrollReport(selected as number, run?.name ?? String(selected));
    } catch {
      setError("Failed to download.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ReportCard title="Payroll Report" description="Payslip breakdown for a specific payroll run.">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value ? Number(e.target.value) : "")}
        className="block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
      >
        <option value="">Select payroll run…</option>
        {runs.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name} ({r.period_start} – {r.period_end})
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <DownloadButton onClick={download} loading={loading}>
        Download CSV
      </DownloadButton>
    </ReportCard>
  );
}
