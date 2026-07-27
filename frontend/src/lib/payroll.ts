import { api } from "./api";

export type RunStatus = "draft" | "computed" | "approved" | "posted";

export type PayrollRun = {
  id: number;
  name: string;
  pay_group?: "confidential" | "non_confidential" | null;
  period_start: string;
  period_end: string;
  pay_date: string;
  status: RunStatus;
  notes: string | null;
  payslip_count?: number;
  total_gross?: number;
  total_net?: number;
  payslips?: Payslip[];
};

export type Payslip = {
  id: number;
  employee: { id: number; employee_no: string; name: string };
  days_worked: string | number;
  days_absent: number;
  late_minutes: number;
  overtime_minutes: number;
  basic_pay: string | number;
  overtime_pay: string | number;
  night_diff_pay?: string | number;
  holiday_pay?: string | number;
  rest_day_pay?: string | number;
  other_earnings?: string | number;
  allowance: string | number;
  gross_pay: string | number;
  sss: string | number;
  philhealth: string | number;
  pagibig: string | number;
  withholding_tax: string | number;
  absences_deduction: string | number;
  tardiness_deduction: string | number;
  loans_deduction?: string | number;
  other_deductions?: string | number;
  total_deductions: string | number;
  net_pay: string | number;
};

export const LOAN_TYPES: { value: string; label: string }[] = [
  { value: "sss_salary", label: "SSS Salary Loan" },
  { value: "sss_calamity", label: "SSS Calamity Loan" },
  { value: "pagibig_mpl", label: "Pag-IBIG MPL" },
  { value: "pagibig_calamity", label: "Pag-IBIG Calamity" },
  { value: "company", label: "Company Loan" },
  { value: "cash_advance", label: "Cash Advance" },
  { value: "other", label: "Other" },
];

export type EmployeeLoan = {
  id: number;
  employee?: { id: number; employee_no: string; name: string } | null;
  employee_id: number;
  type: string;
  reference_no: string | null;
  principal: number;
  amortization: number;
  outstanding_balance: number;
  start_date: string | null;
  is_active: boolean;
  notes: string | null;
};

export type LoanInput = {
  employee_id: number;
  type: string;
  reference_no?: string | null;
  principal?: number;
  amortization: number;
  outstanding_balance?: number;
  start_date?: string | null;
  is_active?: boolean;
  notes?: string | null;
};

export type PayslipAdjustment = {
  id: number;
  employee?: { id: number; employee_no: string; name: string } | null;
  employee_id: number;
  label: string;
  kind: "earning" | "deduction";
  amount: number;
  notes: string | null;
};

export type LoanImportResult = { created: number; updated: number; skipped: number; total: number; errors: { row: number; message: string }[] };

export const loansApi = {
  list: async (params: { employee_id?: number; active_only?: boolean } = {}): Promise<EmployeeLoan[]> =>
    (await api.get<Listed<EmployeeLoan>>("/api/v1/payroll/loans", { params })).data.data,
  create: async (body: LoanInput): Promise<EmployeeLoan> =>
    (await api.post<{ data: EmployeeLoan }>("/api/v1/payroll/loans", body)).data.data,
  update: async (id: number, body: Partial<LoanInput>): Promise<EmployeeLoan> =>
    (await api.patch<{ data: EmployeeLoan }>(`/api/v1/payroll/loans/${id}`, body)).data.data,
  remove: async (id: number) => (await api.delete(`/api/v1/payroll/loans/${id}`)).data,
  importTemplateUrl: "/api/v1/payroll/loans/import/template",
  exportUrl: "/api/v1/payroll/loans/export",
  import: async (file: File): Promise<LoanImportResult> => {
    const fd = new FormData();
    fd.append("file", file);
    return (await api.post<LoanImportResult>("/api/v1/payroll/loans/import", fd)).data;
  },
};

export const adjustmentsApi = {
  list: async (runId: number): Promise<PayslipAdjustment[]> =>
    (await api.get<Listed<PayslipAdjustment>>(`/api/v1/payroll-runs/${runId}/adjustments`)).data.data,
  create: async (runId: number, body: { employee_id: number; label: string; kind: "earning" | "deduction"; amount: number; notes?: string }): Promise<PayslipAdjustment> =>
    (await api.post<{ data: PayslipAdjustment }>(`/api/v1/payroll-runs/${runId}/adjustments`, body)).data.data,
  remove: async (id: number) => (await api.delete(`/api/v1/payroll-adjustments/${id}`)).data,
};

/** Bank disbursement CSV — download via a plain link (uses the session cookie). */
export function bankFileUrl(runId: number): string {
  return `/api/v1/payroll-runs/${runId}/bank-file`;
}

export type CompRow = {
  employee_id: number;
  employee_no: string;
  name: string;
  department: string | null;
  basic_monthly: string | number | null;
  pay_type?: "monthly" | "daily";
  daily_rate?: string | number | null;
  allowance_monthly: string | number | null;
  has_compensation: boolean;
};

export type NewRunInput = {
  name: string;
  pay_group?: "confidential" | "non_confidential" | "";
  period_start: string;
  period_end: string;
  pay_date: string;
  notes?: string;
};

type Listed<T> = { data: T[] };

export const payrollApi = {
  listRuns: async (): Promise<PayrollRun[]> => {
    const { data } = await api.get<Listed<PayrollRun>>("/api/v1/payroll-runs");
    return data.data;
  },
  getRun: async (id: number): Promise<PayrollRun> => {
    const { data } = await api.get<{ data: PayrollRun }>(`/api/v1/payroll-runs/${id}`);
    return data.data;
  },
  createRun: async (body: NewRunInput): Promise<PayrollRun> => {
    const { data } = await api.post<{ data: PayrollRun }>("/api/v1/payroll-runs", body);
    return data.data;
  },
  compute: async (id: number) => (await api.post(`/api/v1/payroll-runs/${id}/compute`)).data,
  approve: async (id: number) => (await api.post(`/api/v1/payroll-runs/${id}/approve`)).data,
  post: async (id: number) => (await api.post(`/api/v1/payroll-runs/${id}/post`)).data,
  deleteRun: async (id: number) => (await api.delete(`/api/v1/payroll-runs/${id}`)).data,
};

// ── Payroll timekeeping review ──────────────────────────────────────────────

export type TimekeepingHead = { employee_id: number; name: string; email: string | null; mobile: string | null };
export type TimekeepingRow = {
  employee_id: number;
  employee_no: string;
  name: string;
  department: string | null;
  attendance: {
    scheduled_days: number; present_days: number; absent_days: number; leave_days: number;
    late_minutes: number; ot_minutes: number; undertime_minutes: number; night_minutes: number;
  };
  floating_total: number;
  floating: Record<string, number>;
  head: TimekeepingHead | null;
};
export type TimekeepingReview = {
  period: { from: string; to: string };
  summary: { employees: number; with_floating: number; floating_total: number };
  items: TimekeepingRow[];
};

export const FLOATING_LABELS: Record<string, string> = {
  overtime: "OT", undertime: "UT", official_business: "OB", coa: "COA", correction: "Correction",
};

export type TimekeepingDay = {
  date: string; dow: string;
  scheduled_in: string | null; scheduled_out: string | null;
  actual_in: string | null; actual_out: string | null;
  hours_worked: number; late_minutes: number; undertime_minutes: number; overtime_minutes: number; night_diff_minutes: number;
  status: string;
};
export type TimekeepingFloating = { type: string; label: string; date: string | null; reason: string | null; id: number };
export type TimekeepingDetail = {
  period: { from: string; to: string };
  employee: { employee_id: number; employee_no: string; name: string; department: string | null; position: string | null };
  totals: { scheduled_days: number; present_days: number; absent_days: number; leave_days: number; late_minutes: number; ot_minutes: number; undertime_minutes: number; night_minutes: number };
  days: TimekeepingDay[];
  floating: TimekeepingFloating[];
  head: TimekeepingHead | null;
};

export const timekeepingApi = {
  review: async (from?: string, to?: string): Promise<TimekeepingReview> => {
    const { data } = await api.get<TimekeepingReview>("/api/v1/payroll/timekeeping", { params: { from, to } });
    return data;
  },
  detail: async (employee_id: number, from?: string, to?: string): Promise<TimekeepingDetail> => {
    const { data } = await api.get<TimekeepingDetail>(`/api/v1/payroll/timekeeping/${employee_id}`, { params: { from, to } });
    return data;
  },
  remind: async (employee_id: number, from?: string, to?: string): Promise<{ message: string; sent: number }> => {
    const { data } = await api.post("/api/v1/payroll/timekeeping/remind", { employee_id, from, to });
    return data;
  },
};

export type SalaryRecord = {
  id: number;
  basic_monthly: string;
  allowance_monthly: string;
  effective_from: string | null;
  is_active: boolean;
};

export const compensationApi = {
  list: async (): Promise<CompRow[]> => {
    const { data } = await api.get<Listed<CompRow>>("/api/v1/compensations");
    return data.data;
  },
  /** Appends a new salary record and closes the previous one. */
  save: async (body: {
    employee_id: number;
    pay_type?: "monthly" | "daily";
    basic_monthly?: number;
    daily_rate?: number;
    allowance_monthly?: number;
    effective_from?: string | null;
  }) => (await api.post("/api/v1/compensations", body)).data,

  history: async (employeeId: number): Promise<SalaryRecord[]> => {
    const { data } = await api.get<Listed<SalaryRecord>>(`/api/v1/employees/${employeeId}/compensations`);
    return data.data;
  },
  destroy: (employeeId: number, id: number) =>
    api.delete(`/api/v1/employees/${employeeId}/compensations/${id}`),
};

// ── Employee's own payslips ─────────────────────────────────────────────────

export type MyPayslipListItem = {
  id: number;
  run: { name: string; period_start: string; period_end: string; pay_date: string; status: string };
  gross_pay: number;
  total_deductions: number;
  net_pay: number;
};

export type PayslipLine = { label: string; note?: string; amount: number };

export type MyPayslipDetail = {
  id: number;
  company: { name: string; address: string };
  employee: { employee_no: string; name: string; department: string | null; position: string | null; tin: string | null; sss_no: string | null; philhealth_no: string | null; hdmf_no: string | null };
  payroll_date: string;
  date_covered: string;
  compensation: PayslipLine[];
  deductions: PayslipLine[];
  ytd: { taxable_gross: number; tax: number; sss: number; phic: number; hdmf: number; gross_income: number; non_taxable: number };
  total_compensation: number;
  total_deductions: number;
  net_pay: number;
};

export const myPayslipsApi = {
  list: async (): Promise<MyPayslipListItem[]> =>
    (await api.get<Listed<MyPayslipListItem>>("/api/v1/my/payslips")).data.data,
  get: async (id: number): Promise<MyPayslipDetail> =>
    (await api.get<{ data: MyPayslipDetail }>(`/api/v1/my/payslips/${id}`)).data.data,
};

/** Format a peso amount from a string|number value. */
export function peso(v: string | number | null | undefined): string {
  const n = Number(v ?? 0);
  return n.toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

// ── Per-employee payroll profile (Current Payroll Information) ───────────────

export type PayrollProfileInput = {
  work_days_per_year?: number | null;
  cost_center?: string | null;
  is_rohq?: boolean;

  is_minimum_wage_earner?: boolean;
  daily_allowance?: number | null;
  de_minimis?: number | null;
  pay_group?: string | null;
  consultant_percent_tax?: number | null;
  work_hours_per_day?: number | null;
  ot_computation_table?: string | null;

  sss_contribution_mode?: "system" | "fixed";
  sss_fixed_amount?: number | null;
  hdmf_contribution_mode?: "system" | "fixed";
  hdmf_additional?: number | null;
  philhealth_contribution_mode?: "system" | "fixed";
  philhealth_fixed_amount?: number | null;

  has_previous_employment?: boolean;
  prev_nontax_13th_month?: number | null;
  prev_nontax_other_bonus?: number | null;
  prev_nontax_salaries?: number | null;
  prev_13th_month?: number | null;
  prev_other_bonus?: number | null;
  prev_taxable_gross?: number | null;
  prev_tax_withheld?: number | null;
  prev_government_deductions?: number | null;
  prev_de_minimis?: number | null;
  prev_taxable_compensation?: number | null;
  prev_monetized_leave?: number | null;
};

export const payrollProfileApi = {
  get: async (employeeId: number) =>
    (await api.get<{ data: unknown }>(`/api/v1/employees/${employeeId}/payroll-profile`)).data.data,
  save: async (employeeId: number, body: PayrollProfileInput) =>
    (await api.put(`/api/v1/employees/${employeeId}/payroll-profile`, body)).data,
};

// ── Payroll User Access ──────────────────────────────────────────────────────
// Backed by Spatie's per-company role grants (model_has_roles.company_id),
// not a separate table.

export type PayrollAccessRow = {
  user_id: number;
  user_name: string;
  user_email: string;
  is_active: boolean;
  company_id: number;
  company_code: string;
  company_name: string;
  payroll_role: string;
};

export type PayrollAccessOptions = {
  roles: string[];
  companies: { id: number; code: string; name: string }[];
};

export const payrollAccessApi = {
  list: async (): Promise<PayrollAccessRow[]> =>
    (await api.get<{ data: PayrollAccessRow[] }>("/api/v1/payroll-access")).data.data,

  options: async (): Promise<PayrollAccessOptions> =>
    (await api.get<{ data: PayrollAccessOptions }>("/api/v1/payroll-access/options")).data.data,

  grant: async (body: { user_id: number; company_id: number; payroll_role: string }) =>
    (await api.post("/api/v1/payroll-access", body)).data,

  revoke: async (body: { user_id: number; company_id: number; payroll_role: string }) =>
    (await api.delete("/api/v1/payroll-access", { data: body })).data,
};
