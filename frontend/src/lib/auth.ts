import { api, ensureCsrf } from "./api";

export type Me = {
  user: {
    id: number;
    name: string;
    email: string;
    is_active: boolean;
    /** True while the account still has its shared/temp password — forces a change. */
    must_change_password?: boolean;
    last_login_at: string | null;
    active_company: { id: number; code: string; legal_name: string } | null;
    original_company_id: number | null;
    companies: Array<{ id: number; code: string; legal_name: string }>;
    roles: string[];
    permissions: string[];
    employee: {
      id: number;
      employee_no: string;
      full_name: string;
      department: string | null;
      position: string | null;
      date_hired: string | null;
    } | null;
  };
};

export async function login(email: string, password: string): Promise<void> {
  await ensureCsrf();
  await api.post("/api/v1/login", { email, password });
}

export async function logout(): Promise<void> {
  // Refresh CSRF first (the token may have expired in a long-open tab),
  // and never throw — we want to land on /login regardless of the result.
  try {
    await ensureCsrf();
    await api.post("/api/v1/logout");
  } catch {
    // Session is being ended anyway; ignore server-side failures.
  }
}

export async function getMe(): Promise<Me> {
  const { data } = await api.get<Me>("/api/v1/me");
  return data;
}

export async function switchCompany(companyId: number): Promise<void> {
  await api.post("/api/v1/companies/switch", { company_id: companyId });
}

export async function changePassword(data: {
  current_password: string;
  password: string;
  password_confirmation: string;
}): Promise<void> {
  await api.post("/api/v1/my/change-password", data);
}

export async function forgotPassword(email: string): Promise<void> {
  await api.post("/api/v1/forgot-password", { email });
}

export async function resetPassword(
  token: string,
  email: string,
  password: string,
  password_confirmation: string,
): Promise<void> {
  await api.post("/api/v1/reset-password", { token, email, password, password_confirmation });
}
