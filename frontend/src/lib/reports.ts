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

export function downloadLeaveReport(params: { date_from?: string; date_to?: string; status?: string }) {
  return downloadCsv("/api/v1/reports/leave", {
    date_from: params.date_from || undefined,
    date_to: params.date_to || undefined,
    status: params.status || undefined,
  }, "leave_report.csv");
}

export function downloadPayrollReport(payrollRunId: number, label: string) {
  return downloadCsv(`/api/v1/reports/payroll/${payrollRunId}`, {}, `payroll_${label}.csv`);
}
