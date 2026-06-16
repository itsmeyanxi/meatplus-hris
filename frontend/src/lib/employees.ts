import { api } from "./api";

export type EmployeeListItem = {
  id: number;
  employee_no: string;
  full_name: string;
  last_name: string;
  first_name: string;
  email_company: string | null;
  date_hired: string | null;
  is_active: boolean;
  department?: { id: number; name: string };
  position?: { id: number; title: string };
  employment_type?: { id: number; name: string };
};

export type EmployeeDetail = EmployeeListItem & {
  middle_name: string | null;
  suffix: string | null;
  birth_date: string | null;
  gender: string;
  civil_status: string;
  nationality: string;
  religion: string | null;
  email_personal: string | null;
  mobile: string | null;
  phone_home: string | null;
  address: AddressBlock;
  permanent_address: AddressBlock;
  branch?: { id: number; name: string };
  manager?: { id: number; full_name: string } | null;
  date_regularized: string | null;
  date_separated: string | null;
  separation_reason: string | null;
};

type AddressBlock = {
  line1: string | null;
  line2: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
};

type PaginatedResponse<T> = {
  data: T[];
  meta: { current_page: number; last_page: number; per_page: number; total: number };
  links: { first: string; last: string; prev: string | null; next: string | null };
};

export type LookupItem = { id: number; code?: string; name?: string; title?: string };

export async function listEmployees(params: {
  q?: string;
  page?: number;
  perPage?: number;
  onlyActive?: boolean;
} = {}): Promise<PaginatedResponse<EmployeeListItem>> {
  const { data } = await api.get<PaginatedResponse<EmployeeListItem>>("/api/v1/employees", {
    params: {
      q: params.q || undefined,
      page: params.page,
      per_page: params.perPage,
      only_active: params.onlyActive,
    },
  });
  return data;
}

export async function getEmployee(id: number): Promise<EmployeeDetail> {
  const { data } = await api.get<{ data: EmployeeDetail }>(`/api/v1/employees/${id}`);
  return data.data;
}

export type EmployeeCreateInput = {
  employee_no: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  suffix?: string | null;
  birth_date: string;
  gender: "male" | "female" | "other";
  civil_status: "single" | "married" | "widowed" | "separated" | "divorced";
  nationality?: string;
  email_personal?: string | null;
  email_company?: string | null;
  mobile?: string | null;
  phone_home?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  branch_id: number;
  department_id: number;
  position_id: number;
  employment_type_id: number;
  date_hired: string;
};

export async function createEmployee(input: EmployeeCreateInput): Promise<EmployeeDetail> {
  const { data } = await api.post<{ data: EmployeeDetail }>("/api/v1/employees", input);
  return data.data;
}

export async function updateEmployee(
  id: number,
  input: Partial<EmployeeCreateInput>,
): Promise<EmployeeDetail> {
  const { data } = await api.patch<{ data: EmployeeDetail }>(`/api/v1/employees/${id}`, input);
  return data.data;
}

export async function getLookup(
  resource: "branches" | "departments" | "positions" | "employment-types",
  params: { department_id?: number } = {},
): Promise<LookupItem[]> {
  const { data } = await api.get<{ data: LookupItem[] }>(`/api/v1/lookups/${resource}`, { params });
  return data.data;
}
