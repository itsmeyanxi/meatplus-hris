import { api } from "./api";

async function downloadFile(url: string, params: Record<string, string | number | undefined>, filename: string) {
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
  return downloadFile("/api/v1/employees/export", { department_id: params.department_id || undefined }, "employee_roster.xlsx");
}

export function downloadDtrReport(params: { date_from: string; date_to: string; employee_id?: number | ""; department_id?: number | "" }) {
  return downloadFile("/api/v1/reports/dtr", {
    date_from: params.date_from,
    date_to: params.date_to,
    employee_id: params.employee_id || undefined,
    department_id: params.department_id || undefined,
  }, `timekeeping_${params.date_from}_to_${params.date_to}.xlsx`);
}

export function downloadLeaveReport(params: {
  date_from?: string;
  date_to?: string;
  status?: string;
  employee_id?: number | "";
  department_id?: number | "";
}) {
  return downloadFile("/api/v1/reports/leave", {
    date_from: params.date_from || undefined,
    date_to: params.date_to || undefined,
    status: params.status || undefined,
    employee_id: params.employee_id || undefined,
    department_id: params.department_id || undefined,
  }, "leave_report.xlsx");
}

export function downloadOvertimeReport(params: {
  date_from?: string;
  date_to?: string;
  status?: string;
}) {
  return downloadFile("/api/v1/reports/overtime", {
    date_from: params.date_from || undefined,
    date_to: params.date_to || undefined,
    status: params.status || undefined,
  }, "overtime_report.xlsx");
}

export function downloadPayrollReport(payrollRunId: number, label: string) {
  return downloadFile(`/api/v1/reports/payroll/${payrollRunId}`, {}, `payroll_${label}.xlsx`);
}

export function downloadAttendanceSummary(params: { date_from: string; date_to: string; employee_id?: number | ""; department_id?: number | "" }) {
  return downloadFile("/api/v1/reports/attendance-summary", {
    date_from: params.date_from,
    date_to: params.date_to,
    employee_id: params.employee_id || undefined,
    department_id: params.department_id || undefined,
  }, `attendance_summary_${params.date_from}_to_${params.date_to}.xlsx`);
}

export function downloadTimeLogsReport(params: { from?: string; to?: string; employee_id?: number | ""; department_id?: number | "" }) {
  return downloadFile("/api/v1/time-logs/export", {
    from: params.from || undefined,
    to: params.to || undefined,
    employee_id: params.employee_id || undefined,
    department_id: params.department_id || undefined,
  }, "time_logs.xlsx");
}

export function downloadCompensationReport() {
  return downloadFile("/api/v1/reports/compensation", {}, "compensation.xlsx");
}

/**
 * Per-agency attendance workbook (Summary · Daily Shifts · Punch Records) for one
 * branch — or a single worker in it when `employeeId` is given.
 */
export async function downloadAgencyAttendance(params: {
  branchId: number;
  dateFrom: string;
  dateTo: string;
  agencyName?: string;
  employeeId?: number;
  employeeName?: string;
  /** Download-filename prefix; defaults to "agency" (pass e.g. "crew" for the crews board). */
  filePrefix?: string;
}) {
  const { data } = await api.get<Blob>("/api/v1/reports/agency-attendance", {
    params: {
      branch_id: params.branchId,
      date_from: params.dateFrom,
      date_to: params.dateTo,
      employee_id: params.employeeId || undefined,
    },
    responseType: "blob",
    timeout: 120000,
  });
  const label = params.employeeId ? params.employeeName ?? "worker" : params.agencyName ?? "agency";
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const href = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = href;
  a.download = `${params.filePrefix ?? "agency"}_${slug}_attendance_${params.dateFrom}_to_${params.dateTo}.xlsx`;
  a.click();
  URL.revokeObjectURL(href);
}

export function downloadLoansReport() {
  return downloadFile("/api/v1/payroll/loans/export", {}, "loans.xlsx");
}

export function downloadThirteenthMonth(year: number) {
  return downloadFile("/api/v1/reports/thirteenth-month", { year }, `13th_month_${year}.xlsx`);
}

/** Year-to-Date payroll workbook (in-system runs + prior carry-over), as XLSX. */
export async function downloadYtd(year: number) {
  const res = await api.get<Blob>("/api/v1/reports/ytd", { params: { year }, responseType: "blob", timeout: 120000 });
  const cd = (res.headers["content-disposition"] as string | undefined) ?? "";
  const filename = cd.match(/filename="?([^"]+)"?/)?.[1] ?? `ytd_${year}.xlsx`;
  const href = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
}

export function downloadRemittance(type: "sss" | "philhealth" | "pagibig" | "tax", year: number, month: number) {
  const name =
    type === "tax" ? `bir_1601c_${year}_${month}`
    : type === "sss" ? `remittance_sss_r3_${year}_${month}`
    : `remittance_${type}_${year}_${month}`;
  return downloadFile("/api/v1/reports/remittance", { type, year, month }, `${name}.xlsx`);
}

/**
 * Full data export for the active company: one Excel file per category, zipped.
 * Can take a while to build, so we allow a generous timeout and keep the
 * server-provided filename (company code + timestamp).
 */
// ── Employee Master Data report (configurable field-picker export) ─────────────

export type MasterField = { key: string; label: string; group: string; sensitive: boolean; importable: boolean };
export type MasterFieldsResponse = { company: { id: number; name: string } | null; fields: MasterField[] };
export type MasterColumn = { key: string; label: string };
export type MasterPreview = {
  columns: MasterColumn[];
  rows: Record<string, string | number | null>[];
  total: number;
  returned: number;
  truncated: boolean;
};

export type MasterFilters = {
  fields: string[];
  department_ids: number[];
  branch_ids: number[];
  employee_id?: number | "";
  exclude_inactive?: boolean;
};

function masterParams(f: MasterFilters): Record<string, string | undefined> {
  return {
    fields: f.fields.length ? f.fields.join(",") : undefined,
    department_ids: f.department_ids.length ? f.department_ids.join(",") : undefined,
    branch_ids: f.branch_ids.length ? f.branch_ids.join(",") : undefined,
    employee_id: f.employee_id ? String(f.employee_id) : undefined,
    exclude_inactive: f.exclude_inactive ? "1" : undefined,
  };
}

export async function getEmployeeMasterFields(): Promise<MasterFieldsResponse> {
  const { data } = await api.get<MasterFieldsResponse>("/api/v1/reports/employee-master/fields");
  return data;
}

export async function previewEmployeeMaster(f: MasterFilters): Promise<MasterPreview> {
  const { data } = await api.get<MasterPreview>("/api/v1/reports/employee-master", {
    params: { ...masterParams(f), format: "json" },
  });
  return data;
}

export async function downloadEmployeeMaster(f: MasterFilters, format: "xlsx" | "csv") {
  const params: Record<string, string | undefined> = { ...masterParams(f), format };
  const filtered = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ""));
  const qs = new URLSearchParams(filtered as Record<string, string>).toString();
  const { data } = await api.get<Blob>(`/api/v1/reports/employee-master?${qs}`, { responseType: "blob", timeout: 120000 });
  const href = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = href;
  a.download = `employee_master.${format === "xlsx" ? "xlsx" : "csv"}`;
  a.click();
  URL.revokeObjectURL(href);
}

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
