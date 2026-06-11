import { api } from "./api";

export type Role = "super_admin" | "hr_admin" | "hr_manager" | "it_admin" | "payroll_officer" | "dept_head" | "employee";

export type UserItem = {
  id: number;
  name: string;
  email: string;
  is_active: boolean;
  last_login_at: string | null;
  employee: { id: number; employee_no: string; full_name: string } | null;
  roles: Role[];
};

export type StoreUserInput = {
  name: string;
  email: string;
  password: string;
  role: Role;
  employee_id?: number | null;
};
export type UpdateUserInput = Partial<{
  name: string;
  email: string;
  is_active: boolean;
  role: Role;
}>;

type Listed<T> = { data: T[] };

export const usersApi = {
  list: async (params: { q?: string; only_active?: boolean } = {}): Promise<UserItem[]> => {
    const { data } = await api.get<Listed<UserItem>>("/api/v1/users", { params });
    return data.data;
  },
  get: async (id: number): Promise<UserItem> => {
    const { data } = await api.get<{ data: UserItem }>(`/api/v1/users/${id}`);
    return data.data;
  },
  create: async (body: StoreUserInput): Promise<UserItem> => {
    const { data } = await api.post<{ data: UserItem }>("/api/v1/users", body);
    return data.data;
  },
  update: async (id: number, body: UpdateUserInput): Promise<UserItem> => {
    const { data } = await api.patch<{ data: UserItem }>(`/api/v1/users/${id}`, body);
    return data.data;
  },
  resetPassword: async (id: number): Promise<{ temporary_password: string }> => {
    const { data } = await api.post<{ temporary_password: string }>(`/api/v1/users/${id}/reset-password`, {});
    return data;
  },
  destroy: (id: number) => api.delete(`/api/v1/users/${id}`),
  provisionForEmployee: async (
    employeeId: number,
  ): Promise<{ user: UserItem; temporary_password: string }> => {
    const { data } = await api.post<{ user: UserItem; temporary_password: string }>(
      `/api/v1/employees/${employeeId}/provision-login`,
      {},
    );
    return data;
  },
};

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  hr_admin: "HR Admin",
  hr_manager: "HR Manager",
  it_admin: "IT Admin",
  payroll_officer: "Payroll Officer",
  dept_head: "Department Head",
  employee: "Employee",
};
