import { api } from "./api";

export const SEPARATION_TYPES = [
  { value: "resigned",               label: "Resigned" },
  { value: "terminated_just",        label: "Terminated (Just Cause)" },
  { value: "terminated_authorized",  label: "Terminated (Authorized Cause)" },
  { value: "end_of_contract",        label: "End of Contract" },
  { value: "retired",                label: "Retired" },
  { value: "deceased",               label: "Deceased" },
] as const;

export type SeparationType = (typeof SEPARATION_TYPES)[number]["value"];

export type LeaveItem = {
  label: string;   // "SIL", "VL", etc.
  name:  string;   // full name
  days:  number;
  amount: number;
};

export type EarningsRow  = { label: string; days?: number; amount: number };
export type DeductionRow = { label: string; amount: number };

export type FinalPayComputed = {
  employee: { id: number; employee_no: string; full_name: string; date_hired: string | null };
  basic_monthly: number;
  daily_rate: number;
  days_worked_last_period: number;
  years_of_service: number;
  unpaid_salary: number;
  suggested_13th_month: number;
  leave_items: LeaveItem[];
  separation_pay: number;
  separation_type: SeparationType;
  last_working_day: string;
};

export type FinalPayRecord = {
  id: number;
  employee_id: number;
  employee?: { id: number; employee_no: string; first_name: string; last_name: string };
  computed_by?: { id: number; name: string } | null;
  last_working_day: string;
  separation_type: SeparationType;
  basic_monthly: string;
  daily_rate: string;
  days_worked_last_period: number;
  years_of_service: string;
  unpaid_salary: string;
  thirteenth_month_pay: string;
  unused_leave_days: string;
  leave_conversion: string;
  separation_pay: string;
  other_earnings: string;
  other_earnings_note: string | null;
  total_gross: string;
  total_deductions_amount: string;
  net_final_pay: string;
  earnings_breakdown:   EarningsRow[]  | null;
  deductions_breakdown: DeductionRow[] | null;
  notes: string | null;
  status: "draft" | "finalized" | "cancelled";
  created_at: string;
};

export type PayrollHistoryMonth = {
  month:            string;   // "January", "February", …
  basic_salary:     number;
  de_minimis:       number;
  other_earnings:   number;
  other_deductions: number;
  sss_phc_hdmf:     number;
  taxable_earnings: number;
  withheld:         number;
};

export type PayrollHistoryTotals = Omit<PayrollHistoryMonth, "month">;

export type PayrollHistory = {
  months: PayrollHistoryMonth[];
  totals: PayrollHistoryTotals;
};

export type SaveFinalPayBody = {
  employee_id:              number;
  last_working_day:         string;
  separation_type:          SeparationType;
  earnings_breakdown:       EarningsRow[];
  deductions_breakdown:     DeductionRow[];
  basic_monthly?:           number;
  daily_rate?:              number;
  days_worked_last_period?: number;
  years_of_service?:        number;
  notes?:                   string;
  status?:                  "draft" | "finalized";
};

export const finalPayApi = {
  list: async (): Promise<FinalPayRecord[]> => {
    const { data } = await api.get<{ data: FinalPayRecord[] }>("/api/v1/final-pays");
    return data.data;
  },

  compute: async (params: {
    employee_id:             number;
    last_working_day:        string;
    separation_type:         SeparationType;
    days_worked_last_period: number;
  }): Promise<FinalPayComputed> => {
    const { data } = await api.post<{ data: FinalPayComputed }>("/api/v1/final-pays/compute", params);
    return data.data;
  },

  store: async (body: SaveFinalPayBody): Promise<FinalPayRecord> => {
    const { data } = await api.post<{ data: FinalPayRecord }>("/api/v1/final-pays", body);
    return data.data;
  },

  get: async (id: number): Promise<FinalPayRecord> => {
    const { data } = await api.get<{ data: FinalPayRecord }>(`/api/v1/final-pays/${id}`);
    return data.data;
  },

  finalize: async (id: number): Promise<FinalPayRecord> => {
    const { data } = await api.patch<{ data: FinalPayRecord }>(`/api/v1/final-pays/${id}`, { status: "finalized" });
    return data.data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/api/v1/final-pays/${id}`);
  },

  cancel: async (id: number, reason: string): Promise<FinalPayRecord> => {
    const { data } = await api.patch<{ data: FinalPayRecord }>(`/api/v1/final-pays/${id}`, {
      status: "cancelled",
      notes: reason,
    });
    return data.data;
  },

  payrollHistory: async (id: number): Promise<PayrollHistory> => {
    const { data } = await api.get<{ data: PayrollHistory }>(`/api/v1/final-pays/${id}/payroll-history`);
    return data.data;
  },
};
