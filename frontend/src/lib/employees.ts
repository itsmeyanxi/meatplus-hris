import { api } from "./api";

export type EmployeeListItem = {
  id: number;
  employee_no: string;
  full_name: string;
  last_name: string;
  first_name: string;
  middle_name: string | null;
  gender: string | null;
  civil_status: string | null;
  email_company: string | null;
  email_personal: string | null;
  date_hired: string | null;
  is_active: boolean;
  login_status: "active" | "invited" | "none";
  department?: { id: number; name: string };
  branch?: { id: number; name: string };
  position?: { id: number; title: string };
  employment_type?: { id: number; name: string };
  company?: { id: number; code: string; name: string };
};

export type EmployeeDetail = EmployeeListItem & {
  biometric_user_id: string | null;
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
  employeeNo?: string;
  name?: string;
  departmentId?: number | "";
  companyId?: number | "";
  page?: number;
  perPage?: number;
  onlyActive?: boolean;
} = {}): Promise<PaginatedResponse<EmployeeListItem>> {
  const { data } = await api.get<PaginatedResponse<EmployeeListItem>>("/api/v1/employees", {
    params: {
      q: params.q || undefined,
      employee_no: params.employeeNo || undefined,
      name: params.name || undefined,
      department_id: params.departmentId || undefined,
      company_id: params.companyId || undefined,
      page: params.page,
      per_page: params.perPage,
      only_active: params.onlyActive,
    },
  });
  return data;
}

export type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
  total: number;
  errors: { row: number; message: string }[];
};

export async function importEmployees(file: File, companyId?: number | ""): Promise<ImportResult> {
  const fd = new FormData();
  fd.append("file", file);
  if (companyId) fd.append("company_id", String(companyId));
  const { data } = await api.post<ImportResult>("/api/v1/employees/import", fd);
  return data;
}

export const employeeImportTemplateUrl = "/api/v1/employees/import/template";

/** URL for the filtered CSV export (download via a plain link — uses the session cookie). */
export function employeeExportUrl(
  params: { employeeNo?: string; name?: string; departmentId?: number | ""; companyId?: number | "" } = {},
): string {
  const qs = new URLSearchParams();
  if (params.employeeNo) qs.set("employee_no", params.employeeNo);
  if (params.name) qs.set("name", params.name);
  if (params.departmentId) qs.set("department_id", String(params.departmentId));
  if (params.companyId) qs.set("company_id", String(params.companyId));
  const q = qs.toString();
  return `/api/v1/employees/export${q ? `?${q}` : ""}`;
}

export async function getEmployee(id: number): Promise<EmployeeDetail> {
  const { data } = await api.get<{ data: EmployeeDetail }>(`/api/v1/employees/${id}`);
  return data.data;
}

export type EmployeeCreateInput = {
  /** Register into this company. Omit to use the caller's active company. */
  company_id?: number;
  employee_no: string;
  biometric_user_id?: string | null;
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
  /** Primary contact number — required by the API on create. */
  mobile: string;
  phone_home?: string | null;
  local_trunk_line?: string | null;
  trunk_pin?: string | null;
  skype_id?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  branch_id: number;
  department_id: number;
  position_id: number;
  employment_type_id: number;
  manager_employee_id?: number | null;
  employee_type?: string | null;
  user_type?: string | null;
  job_code?: string | null;
  job_grade?: string | null;
  client_name?: string | null;
  billability?: string | null;
  designated_workplace?: string | null;
  payroll_run_type?: string | null;
  remarks?: string | null;
  date_hired: string;
  expected_regularization_date?: string | null;
  date_regularized?: string | null;
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
  resource: "branches" | "departments" | "positions" | "employment-types" | "companies",
  params: { department_id?: number; company_id?: number } = {},
): Promise<LookupItem[]> {
  const { data } = await api.get<{ data: LookupItem[] }>(`/api/v1/lookups/${resource}`, { params });
  return data.data;
}
