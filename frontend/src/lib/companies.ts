import { api } from "./api";

export type Company = {
  id: number;
  code: string;
  legal_name: string;
  trade_name: string | null;
  name: string;
  is_active: boolean;
  users_count?: number;
};

export async function getCompanies(): Promise<Company[]> {
  const { data } = await api.get<{ data: Company[] }>("/api/v1/companies");
  return data.data;
}

export async function createCompany(
  payload: Pick<Company, "code" | "legal_name" | "trade_name" | "is_active">
): Promise<Company> {
  const { data } = await api.post<{ data: Company }>("/api/v1/companies", payload);
  return data.data;
}

export async function updateCompany(
  id: number,
  payload: Partial<Pick<Company, "code" | "legal_name" | "trade_name" | "is_active">>
): Promise<Company> {
  const { data } = await api.put<{ data: Company }>(`/api/v1/companies/${id}`, payload);
  return data.data;
}
