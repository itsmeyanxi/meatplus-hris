import { api } from "./api";

export type LeaveType = {
  id: number;
  code: string;
  name: string;
  default_credits_per_year: string;
  is_paid: boolean;
  requires_attachment: boolean;
  gender_restriction: "male" | "female" | null;
  accrual_method: string;
  max_consecutive_days: number | null;
};

export type LeaveBalance = {
  id: number;
  employee_id: number;
  employee?: { id: number; employee_no: string; full_name: string };
  leave_type: { id: number; code: string; name: string };
  year: number;
  opening_balance: string;
  accrued: string;
  used: string;
  current_balance: number;
};

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export type LeaveApplication = {
  id: number;
  employee_id: number;
  employee?: { id: number; employee_no: string; full_name: string };
  leave_type: { id: number; code: string; name: string };
  date_from: string;
  date_to: string;
  days_count: string;
  half_day: "am" | "pm" | null;
  reason: string;
  status: LeaveStatus;
  approved_by?: { id: number; name: string } | null;
  decided_at: string | null;
  decision_remarks: string | null;
};

export type LeaveAppInput = {
  employee_id?: number;
  leave_type_id: number;
  date_from: string;
  date_to: string;
  half_day?: "am" | "pm" | null;
  reason: string;
};

type Listed<T> = { data: T[] };

export const leaveTypesApi = {
  list: async (): Promise<LeaveType[]> => {
    const { data } = await api.get<Listed<LeaveType>>("/api/v1/leave-types");
    return data.data;
  },
};

export const leaveBalancesApi = {
  list: async (params: { year?: number; employee_id?: number } = {}): Promise<LeaveBalance[]> => {
    const { data } = await api.get<Listed<LeaveBalance>>("/api/v1/leave-balances", { params });
    return data.data;
  },
};

export const leaveAppsApi = {
  list: async (params: { status?: LeaveStatus; employee_id?: number; from?: string; to?: string } = {}): Promise<LeaveApplication[]> => {
    const { data } = await api.get<Listed<LeaveApplication>>("/api/v1/leave-applications", { params });
    return data.data;
  },
  create: async (body: LeaveAppInput): Promise<LeaveApplication> => {
    const { data } = await api.post<{ data: LeaveApplication }>("/api/v1/leave-applications", body);
    return data.data;
  },
  approve: async (id: number, decision_remarks?: string) => {
    const { data } = await api.post<{ data: LeaveApplication }>(`/api/v1/leave-applications/${id}/approve`, { decision_remarks });
    return data.data;
  },
  reject: async (id: number, decision_remarks?: string) => {
    const { data } = await api.post<{ data: LeaveApplication }>(`/api/v1/leave-applications/${id}/reject`, { decision_remarks });
    return data.data;
  },
  cancel: async (id: number) => {
    const { data } = await api.post<{ data: LeaveApplication }>(`/api/v1/leave-applications/${id}/cancel`, {});
    return data.data;
  },
};
