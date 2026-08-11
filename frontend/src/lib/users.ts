import { api } from "./api";

export type Role =
  | "admin"
  | "hr_confi"
  | "hr_admin"
  | "hr_officer"
  | "it_admin"
  | "it_staff"
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
  /** Heartbeat of the user's last authenticated request (drives the online dot). */
  last_seen_at: string | null;
  /** True when the user has been active within the last few minutes. */
  is_online: boolean;
  employee: { id: number; employee_no: string; full_name: string; position?: string | null } | null;
  suggested_role?: Role | null;
  roles: Role[];
  /** Companies this user can access / switch between (multi-company HR staff). */
  companies?: { id: number; code: string | null; legal_name: string }[];
  /** The user's "home" company — used to group the Users list. */
  primary_company?: { id: number; code: string | null; legal_name: string } | null;
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
  roles: Role[];
  company_ids: number[];
}>;

export type BulkProvisionResult = {
  message: string;
  created: number;
  skipped: number;
  errors: string[];
  accounts: { employee_no: string; name: string; username: string }[];
};

type Listed<T> = { data: T[] };

export type RoleWithPermissions = { name: Role; permissions: string[] };

/** Every role + its permission names (IT Admin only). Drives the "view as role" preview. */
export async function getRoles(): Promise<RoleWithPermissions[]> {
  const { data } = await api.get<Listed<RoleWithPermissions>>("/api/v1/roles");
  return data.data;
}

export const usersApi = {
  list: async (params: { q?: string; only_active?: boolean; company_id?: number } = {}): Promise<UserItem[]> => {
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
  deactivate: async (id: number): Promise<UserItem> => {
    const { data } = await api.patch<{ data: UserItem }>(`/api/v1/users/${id}/deactivate`);
    return data.data;
  },
  activate: async (id: number): Promise<UserItem> => {
    const { data } = await api.patch<{ data: UserItem }>(`/api/v1/users/${id}/activate`);
    return data.data;
  },
  destroy: (id: number) => api.delete(`/api/v1/users/${id}`),
  /**
   * Bulk-create login accounts for active employees, all sharing one password and
   * forced to change it on first sign-in. Employees log in with their employee
   * number as username. Returns the created usernames so the admin can distribute.
   */
  bulkProvision: async (
    password: string,
    employeeIds: number[],
  ): Promise<BulkProvisionResult> => {
    const { data } = await api.post<BulkProvisionResult>("/api/v1/users/bulk-provision", {
      password,
      employee_ids: employeeIds,
    });
    return data;
  },
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
  admin: "Admin (Super Admin — all companies)",
  hr_confi: "HR Confi (confidential data)",
  hr_admin: "HR Admin",
  hr_officer: "HR Officer",
  it_admin: "IT Admin",
  it_staff: "IT Staff",
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
