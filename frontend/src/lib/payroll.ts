import { api } from "./api";

export type RunStatus = "draft" | "computed" | "approved" | "posted";

export type PayrollRun = {
  id: number;
  name: string;
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
  allowance: string | number;
  gross_pay: string | number;
  sss: string | number;
  philhealth: string | number;
  pagibig: string | number;
  withholding_tax: string | number;
  absences_deduction: string | number;
  tardiness_deduction: string | number;
  total_deductions: string | number;
  net_pay: string | number;
};

export type CompRow = {
  employee_id: number;
  employee_no: string;
  name: string;
  department: string | null;
  basic_monthly: string | number | null;
  allowance_monthly: string | number | null;
  has_compensation: boolean;
};

export type NewRunInput = {
  name: string;
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
    basic_monthly: number;
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
