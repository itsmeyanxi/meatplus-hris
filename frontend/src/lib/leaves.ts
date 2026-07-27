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
  days_count: number;
  half_day: "am" | "pm" | null;
  reason: string;
  attachment_path: string | null;
  status: LeaveStatus;
  approved_by?: { id: number; name: string } | null;
  decided_at: string | null;
  decision_remarks: string | null;
  created_at: string;
};

export type LeaveTypeInput = {
  code: string;
  name: string;
  default_credits_per_year: number;
  is_paid: boolean;
  requires_attachment: boolean;
  accrual_method?: string;
  gender_restriction?: "male" | "female" | null;
  max_consecutive_days?: number | null;
};

export type LeaveAppInput = {
  employee_id?: number;
  leave_type_id: number;
  date_from: string;
  date_to: string;
  half_day?: "am" | "pm" | null;
  reason: string;
  attachment?: File | null;
};

type Listed<T> = { data: T[] };

export const leaveTypesApi = {
  list: async (): Promise<LeaveType[]> => {
    const { data } = await api.get<Listed<LeaveType>>("/api/v1/leave-types");
    return data.data;
  },
  create: async (body: LeaveTypeInput): Promise<LeaveType> => {
    const { data } = await api.post<{ data: LeaveType }>("/api/v1/leave-types", body);
    return data.data;
  },
  update: async (id: number, body: LeaveTypeInput): Promise<LeaveType> => {
    const { data } = await api.put<{ data: LeaveType }>(`/api/v1/leave-types/${id}`, body);
    return data.data;
  },
  destroy: async (id: number): Promise<void> => {
    await api.delete(`/api/v1/leave-types/${id}`);
  },
};

export const leaveBalancesApi = {
  list: async (params: { year?: number; employee_id?: number } = {}): Promise<LeaveBalance[]> => {
    const { data } = await api.get<Listed<LeaveBalance>>("/api/v1/leave-balances", { params });
    return data.data;
  },
  adjust: async (id: number, adjustment: number, note: string): Promise<LeaveBalance> => {
    const { data } = await api.post<{ data: LeaveBalance }>(`/api/v1/leave-balances/${id}/adjust`, { adjustment, note });
    return data.data;
  },
  /** Assign a leave plan to an employee. Idempotent: re-assigning updates the row. */
  assign: async (
    employeeId: number,
    body: { leave_type_id: number; year?: number; opening_balance?: number | null },
  ): Promise<LeaveBalance> => {
    const { data } = await api.post<{ data: LeaveBalance }>(
      `/api/v1/employees/${employeeId}/leave-balances`,
      body,
    );
    return data.data;
  },
};

export const leaveAppsApi = {
  list: async (params: { status?: LeaveStatus; employee_id?: number; leave_type_id?: number; from?: string; to?: string } = {}): Promise<LeaveApplication[]> => {
    const { data } = await api.get<Listed<LeaveApplication>>("/api/v1/leave-applications", { params });
    return data.data;
  },
  get: async (id: number): Promise<LeaveApplication> => {
    const { data } = await api.get<{ data: LeaveApplication }>(`/api/v1/leave-applications/${id}`);
    return data.data;
  },
  create: async (body: LeaveAppInput): Promise<LeaveApplication> => {
    const fd = new FormData();
    if (body.employee_id != null) fd.append("employee_id", String(body.employee_id));
    fd.append("leave_type_id", String(body.leave_type_id));
    fd.append("date_from", body.date_from);
    fd.append("date_to", body.date_to);
    if (body.half_day) fd.append("half_day", body.half_day);
    fd.append("reason", body.reason);
    if (body.attachment) fd.append("attachment", body.attachment);
    const { data } = await api.post<{ data: LeaveApplication }>("/api/v1/leave-applications", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data.data;
  },
  attachmentUrl: (id: number) => `/api/v1/leave-applications/${id}/attachment`,
  importTemplateUrl: "/api/v1/leave-applications/import/template",
  import: async (file: File): Promise<{ created: number; skipped: number; total: number; errors: { row: number; message: string }[] }> => {
    const fd = new FormData();
    fd.append("file", file);
    const { data } = await api.post("/api/v1/leave-applications/import", fd);
    return data;
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
