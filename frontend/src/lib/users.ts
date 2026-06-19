import { api } from "./api";

export type Role =
  | "hr_admin"
  | "it_admin"
  | "payroll_officer"
  | "dept_head"
  | "employee"
  | "supervisor"
  | "team_lead"
  | "dept_admin"
  | "transport_access"
  | "sales_employee"
  | "timekeeper"
  | "hr_coordinator"
  | "garahe_teamlead";

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

export type RoleWithPermissions = { name: Role; permissions: string[] };

/** Every role + its permission names (IT Admin only). Drives the "view as role" preview. */
export async function getRoles(): Promise<RoleWithPermissions[]> {
  const { data } = await api.get<Listed<RoleWithPermissions>>("/api/v1/roles");
  return data.data;
}

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
  hr_admin: "HR Admin",
  it_admin: "IT Admin",
  payroll_officer: "Payroll Officer",
  dept_head: "Department Head",
  employee: "Employee",
  supervisor: "Supervisor/Manager",
  team_lead: "Team Lead",
  dept_admin: "Admin Dept. Access",
  transport_access: "Transport Access",
  sales_employee: "Sales Employee",
  timekeeper: "Timekeeper",
  hr_coordinator: "HR Coordinator",
  garahe_teamlead: "Garahe Teamlead/Timekeep",
};
