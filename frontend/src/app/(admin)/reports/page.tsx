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
  downloadAttendanceSummary,
  downloadTimeLogsReport,
  downloadCompensationReport,
  downloadLoansReport,
  downloadThirteenthMonth,
  downloadYtd,
  downloadRemittance,
} from "@/lib/reports";
import { getMe } from "@/lib/auth";
import { getLookup } from "@/lib/employees";
import { EmployeeSearchSelect } from "@/components/EmployeeSearchSelect";
import { SearchSelect } from "@/components/SearchSelect";

const fieldCls =
  "mt-0.5 block rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900";

export default function ReportsPage() {
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const canPayroll = me?.user.permissions?.includes("payroll.view") ?? false;

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Download data exports as formatted Excel files, or the full company dataset as a zipped Excel bundle." />

      <SectionTitle>Attendance</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        <AttendanceSummaryCard />
        <DtrReportCard />
        <TimeLogsCard />
        <LeaveReportCard />
        <OvertimeReportCard />
      </div>

      <SectionTitle>Employees</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        <EmployeeRosterCard />
        {canPayroll && <CompensationCard />}
      </div>

      {canPayroll && (
        <>
          <SectionTitle>Payroll</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <PayrollReportCard />
            <LoansCard />
          </div>

          <SectionTitle>Statutory &amp; Year-End</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <ThirteenthMonthCard />
            <YtdCard />
            <RemittanceCard />
          </div>
        </>
      )}

      <SectionTitle>Everything</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        <FullExportCard />
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="pt-2 text-xs font-bold uppercase tracking-wide text-slate-500">{children}</h2>;
}

// ── simple one-click download card ──────────────────────────────────────────
function SimpleDownloadCard({ title, description, fn }: { title: string; description: string; fn: () => Promise<void> }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const download = async () => {
    setError(null); setLoading(true);
    try { await fn(); } catch { setError("Failed to download."); } finally { setLoading(false); }
  };
  return (
    <ReportCard title={title} description={description}>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <DownloadButton onClick={download} loading={loading}>Download Excel</DownloadButton>
    </ReportCard>
  );
}

function CompensationCard() {
  return <SimpleDownloadCard title="Compensation / Salaries" description="Active pay type, rate, allowance and effective date per employee." fn={downloadCompensationReport} />;
}

function LoansCard() {
  return <SimpleDownloadCard title="Loans & Balances" description="Every employee loan with amortization and outstanding balance." fn={downloadLoansReport} />;
}

// ── date-range card with department + employee filters ──────────────────────
function RangeReportCard({
  title, description, onDownload,
}: {
  title: string;
  description: string;
  onDownload: (p: { from: string; to: string; employee_id: number | ""; department_id: number | "" }) => Promise<void>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + "01";
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [employeeId, setEmployeeId] = useState<number | "">("");
  const [departmentId, setDepartmentId] = useState<number | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: departments = [] } = useQuery({ queryKey: ["lookups", "departments"], queryFn: () => getLookup("departments"), staleTime: 5 * 60 * 1000 });

  const download = async () => {
    if (!from || !to) { setError("Both dates are required."); return; }
    setError(null); setLoading(true);
    try { await onDownload({ from, to, employee_id: employeeId, department_id: departmentId }); }
    catch { setError("Failed to download. Check your date range."); }
    finally { setLoading(false); }
  };

  return (
    <ReportCard title={title} description={description}>
      <div className="flex flex-wrap gap-2">
        <label className="block"><span className="text-xs text-slate-500">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={fieldCls} /></label>
        <label className="block"><span className="text-xs text-slate-500">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={fieldCls} /></label>
        <label className="block"><span className="text-xs text-slate-500">Department</span>
          <SearchSelect value={departmentId} onChange={(v) => setDepartmentId(v ? Number(v) : "")} className={fieldCls}
            options={[{ value: "", label: "All departments" }, ...departments.map((d) => ({ value: String(d.id), label: d.name }))]} /></label>
        <label className="block"><span className="text-xs text-slate-500">Employee</span>
          <EmployeeSearchSelect value={employeeId} onChange={(id) => setEmployeeId(id === "" ? "" : Number(id))} placeholder="All employees" className={fieldCls} /></label>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <DownloadButton onClick={download} loading={loading}>Download Excel</DownloadButton>
    </ReportCard>
  );
}

function AttendanceSummaryCard() {
  return (
    <RangeReportCard
      title="Attendance Summary"
      description="One row per employee for the period — present / absent / leave days and late, OT, undertime & night totals, like the timekeeping review."
      onDownload={(p) => downloadAttendanceSummary({ date_from: p.from, date_to: p.to, employee_id: p.employee_id, department_id: p.department_id })}
    />
  );
}

function TimeLogsCard() {
  return (
    <RangeReportCard
      title="Time Logs (raw punches)"
      description="Every biometric / manual punch in the range, with device and location."
      onDownload={(p) => downloadTimeLogsReport({ from: p.from, to: p.to, employee_id: p.employee_id, department_id: p.department_id })}
    />
  );
}

function ThirteenthMonthCard() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const download = async () => {
    setError(null); setLoading(true);
    try { await downloadThirteenthMonth(year); } catch { setError("Failed to download."); } finally { setLoading(false); }
  };
  return (
    <ReportCard title="13th-Month Pay" description="Per employee: total basic earned in the year ÷ 12 (per DOLE).">
      <label className="block">
        <span className="text-xs text-slate-500">Year</span>
        <input type="number" min={2020} max={2100} value={year} onChange={(e) => setYear(Number(e.target.value))} className={fieldCls} />
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <DownloadButton onClick={download} loading={loading}>Download Excel</DownloadButton>
    </ReportCard>
  );
}

function YtdCard() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const download = async () => {
    setError(null); setLoading(true);
    try { await downloadYtd(year); } catch { setError("Failed to download."); } finally { setLoading(false); }
  };
  return (
    <ReportCard title="Year-to-Date (YTD) Payroll" description="Per employee: YTD earnings, gov contributions, tax and net — combining in-system runs with prior-period carry-over. Excel.">
      <label className="block">
        <span className="text-xs text-slate-500">Year</span>
        <input type="number" min={2020} max={2100} value={year} onChange={(e) => setYear(Number(e.target.value))} className={fieldCls} />
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <DownloadButton onClick={download} loading={loading}>Download Excel</DownloadButton>
    </ReportCard>
  );
}

function RemittanceCard() {
  const now = new Date();
  const [type, setType] = useState<"sss" | "philhealth" | "pagibig" | "tax">("sss");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const download = async () => {
    setError(null); setLoading(true);
    try { await downloadRemittance(type, year, month); } catch { setError("Failed to download."); } finally { setLoading(false); }
  };
  return (
    <ReportCard title="Statutory Remittance" description="Monthly SSS / PhilHealth / Pag-IBIG (employee + employer share) or BIR 1601-C withholding tax. The SSS (R3) sheet breaks each contribution into Regular SS, MPF/WISP, and the employer EC premium.">
      <div className="flex flex-wrap gap-2">
        <label className="block"><span className="text-xs text-slate-500">Report</span>
          <SearchSelect value={type} onChange={(v) => setType(v as typeof type)} className={fieldCls}
            options={[{ value: "sss", label: "SSS (R3)" }, { value: "philhealth", label: "PhilHealth (RF1)" }, { value: "pagibig", label: "Pag-IBIG (MCRF)" }, { value: "tax", label: "BIR 1601-C (Tax)" }]} /></label>
        <label className="block"><span className="text-xs text-slate-500">Year</span>
          <input type="number" min={2020} max={2100} value={year} onChange={(e) => setYear(Number(e.target.value))} className={fieldCls} /></label>
        <label className="block"><span className="text-xs text-slate-500">Month</span>
          <SearchSelect value={String(month)} onChange={(v) => setMonth(Number(v))} className={fieldCls}
            options={["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m, i) => ({ value: String(i + 1), label: m }))} /></label>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <DownloadButton onClick={download} loading={loading}>Download Excel</DownloadButton>
    </ReportCard>
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
      className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition"
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
        Download Excel
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
    <ReportCard title="Timekeeping Worksheet" description="Per-employee-per-day timekeeping in the Pacific template — punches + hours pre-filled, salary computed, grouped by department.">
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
        Download Excel
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
        Download Excel
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
        Download Excel
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
        Download Excel
      </DownloadButton>
    </ReportCard>
  );
}
