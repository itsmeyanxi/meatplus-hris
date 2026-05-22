import { api, ensureCsrf } from "./api";

export type Me = {
  user: {
    id: number;
    name: string;
    email: string;
    is_active: boolean;
    last_login_at: string | null;
    active_company: { id: number; code: string; legal_name: string } | null;
    companies: Array<{ id: number; code: string; legal_name: string }>;
    roles: string[];
    permissions: string[];
  };
};

export async function login(email: string, password: string): Promise<void> {
  await ensureCsrf();
  await api.post("/api/v1/login", { email, password });
}

export async function logout(): Promise<void> {
  await api.post("/api/v1/logout");
}

export async function getMe(): Promise<Me> {
  const { data } = await api.get<Me>("/api/v1/me");
  return data;
}

export async function switchCompany(companyId: number): Promise<void> {
  await api.post("/api/v1/companies/switch", { company_id: companyId });
}
