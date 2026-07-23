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
  downloadFullExport,
} from "@/lib/reports";
import { getLookup } from "@/lib/employees";
import { EmployeeSearchSelect } from "@/components/EmployeeSearchSelect";
import { SearchSelect } from "@/components/SearchSelect";

const fieldCls =
  "mt-0.5 block rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900";

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Download data exports as CSV files, or the full company dataset as a zipped Excel bundle." />
      <div className="grid gap-4 sm:grid-cols-2">
        <FullExportCard />
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

// Full data export ─────────────────────────────────────────────────────────────

function FullExportCard() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setLoading(true);
    setError(null);
    try {
      await downloadFullExport();
    } catch {
      setError("Failed to generate the export. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sm:col-span-2 rounded-2xl border border-slate-900 bg-slate-900 p-5 space-y-4 text-white">
      <div>
        <h2 className="text-sm font-semibold">Full Data Export — Excel, zipped</h2>
        <p className="mt-0.5 text-xs text-slate-300">
          Everything for the company you&apos;re currently in — employees, salaries, time logs, daily records,
          leave, overtime, payslips, and devices — as separate Excel files bundled in one ZIP.
          Only the categories you have access to are included. Large datasets may take a moment.
        </p>
      </div>
      {error && <p className="rounded-md bg-red-500/20 px-3 py-2 text-xs text-red-200">{error}</p>}
      <button
        onClick={download}
        disabled={loading}
        className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100 disabled:opacity-50 transition"
      >
        {loading ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" />
            Preparing ZIP…
          </>
        ) : (
          <>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download full export (.zip)
          </>
        )}
      </button>
    </div>
  );
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
          <SearchSelect
            value={departmentId}
            onChange={(v) => setDepartmentId(v ? Number(v) : "")}
            className={fieldCls}
            options={[
              { value: "", label: "All departments" },
              ...departments.map((d) => ({ value: String(d.id), label: d.name })),
            ]}
          />
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
          <SearchSelect
            value={departmentId}
            onChange={(v) => setDepartmentId(v ? Number(v) : "")}
            className={fieldCls}
            options={[
              { value: "", label: "All departments" },
              ...departments.map((d) => ({ value: String(d.id), label: d.name })),
            ]}
          />
        </label>
        <label className="block">
          <span className="text-xs text-slate-500">Employee</span>
          <EmployeeSearchSelect
            value={employeeId}
            onChange={(id) => setEmployeeId(id === "" ? "" : Number(id))}
            placeholder="All employees"
            className={fieldCls}
          />
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
          <SearchSelect
            value={status}
            onChange={setStatus}
            className={fieldCls}
            options={[
              { value: "", label: "All" },
              { value: "pending", label: "Pending" },
              { value: "approved", label: "Approved" },
              { value: "rejected", label: "Rejected" },
              { value: "cancelled", label: "Cancelled" },
            ]}
          />
        </label>
        <label className="block">
          <span className="text-xs text-slate-500">Department</span>
          <SearchSelect
            value={departmentId}
            onChange={(v) => setDepartmentId(v ? Number(v) : "")}
            className={fieldCls}
            options={[
              { value: "", label: "All departments" },
              ...departments.map((d) => ({ value: String(d.id), label: d.name })),
            ]}
          />
        </label>
        <label className="block">
          <span className="text-xs text-slate-500">Employee</span>
          <EmployeeSearchSelect
            value={employeeId}
            onChange={(id) => setEmployeeId(id === "" ? "" : Number(id))}
            placeholder="All employees"
            className={fieldCls}
          />
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
          <SearchSelect
            value={status}
            onChange={setStatus}
            className={fieldCls}
            options={[
              { value: "", label: "All" },
              { value: "pending", label: "Pending" },
              { value: "approved", label: "Approved" },
              { value: "rejected", label: "Rejected" },
              { value: "cancelled", label: "Cancelled" },
            ]}
          />
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
      <SearchSelect
        value={selected}
        onChange={(v) => setSelected(v ? Number(v) : "")}
        placeholder="Select payroll run…"
        className="block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
        options={runs.map((r) => ({
          value: String(r.id),
          label: `${r.name} (${r.period_start} – ${r.period_end})`,
        }))}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <DownloadButton onClick={download} loading={loading}>
        Download CSV
      </DownloadButton>
    </ReportCard>
  );
}
