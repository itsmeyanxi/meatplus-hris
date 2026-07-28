import { api } from "./api";

async function downloadCsv(url: string, params: Record<string, string | number | undefined>, filename: string) {
  const filtered = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ""));
  const qs = new URLSearchParams(filtered as Record<string, string>).toString();
  const { data } = await api.get<Blob>(`${url}${qs ? "?" + qs : ""}`, { responseType: "blob" });
  const href = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
}

export function downloadEmployeeRoster(params: { department_id?: number | "" } = {}) {
  return downloadCsv("/api/v1/employees/export", { department_id: params.department_id || undefined }, "employee_roster.csv");
}

export function downloadDtrReport(params: { date_from: string; date_to: string; employee_id?: number | ""; department_id?: number | "" }) {
  return downloadCsv("/api/v1/reports/dtr", {
    date_from: params.date_from,
    date_to: params.date_to,
    employee_id: params.employee_id || undefined,
    department_id: params.department_id || undefined,
  }, `dtr_${params.date_from}_to_${params.date_to}.csv`);
}

export function downloadLeaveReport(params: {
  date_from?: string;
  date_to?: string;
  status?: string;
  employee_id?: number | "";
  department_id?: number | "";
}) {
  return downloadCsv("/api/v1/reports/leave", {
    date_from: params.date_from || undefined,
    date_to: params.date_to || undefined,
    status: params.status || undefined,
    employee_id: params.employee_id || undefined,
    department_id: params.department_id || undefined,
  }, "leave_report.csv");
}

export function downloadOvertimeReport(params: {
  date_from?: string;
  date_to?: string;
  status?: string;
}) {
  return downloadCsv("/api/v1/reports/overtime", {
    date_from: params.date_from || undefined,
    date_to: params.date_to || undefined,
    status: params.status || undefined,
  }, "overtime_report.csv");
}

export function downloadPayrollReport(payrollRunId: number, label: string) {
  return downloadCsv(`/api/v1/reports/payroll/${payrollRunId}`, {}, `payroll_${label}.csv`);
}

export function downloadAttendanceSummary(params: { date_from: string; date_to: string; employee_id?: number | ""; department_id?: number | "" }) {
  return downloadCsv("/api/v1/reports/attendance-summary", {
    date_from: params.date_from,
    date_to: params.date_to,
    employee_id: params.employee_id || undefined,
    department_id: params.department_id || undefined,
  }, `attendance_summary_${params.date_from}_to_${params.date_to}.csv`);
}

export function downloadTimeLogsReport(params: { from?: string; to?: string; employee_id?: number | ""; department_id?: number | "" }) {
  return downloadCsv("/api/v1/time-logs/export", {
    from: params.from || undefined,
    to: params.to || undefined,
    employee_id: params.employee_id || undefined,
    department_id: params.department_id || undefined,
  }, "time_logs.csv");
}

export function downloadCompensationReport() {
  return downloadCsv("/api/v1/reports/compensation", {}, "compensation.csv");
}

export function downloadLoansReport() {
  return downloadCsv("/api/v1/payroll/loans/export", {}, "loans.csv");
}

/**
 * Full data export for the active company: one Excel file per category, zipped.
 * Can take a while to build, so we allow a generous timeout and keep the
 * server-provided filename (company code + timestamp).
 */
export async function downloadFullExport() {
  const res = await api.get<Blob>("/api/v1/reports/full-export", { responseType: "blob", timeout: 180000 });
  const cd = (res.headers["content-disposition"] as string | undefined) ?? "";
  const filename = cd.match(/filename="?([^"]+)"?/)?.[1] ?? "full_export.zip";
  const href = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
}
