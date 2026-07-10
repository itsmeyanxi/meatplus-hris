import { api } from "./api";

type Listed<T> = { data: T[] };

export type Dependent = {
  id: number;
  employee_id: number;
  full_name: string;
  relationship: string;
  birth_date: string | null;
  is_minor: boolean;
  is_pwd: boolean;
  is_qualified_for_tax_exemption: boolean;
};
export type DependentInput = {
  full_name: string;
  relationship: string;
  birth_date?: string | null;
  is_minor?: boolean;
  is_pwd?: boolean;
  is_qualified_for_tax_exemption?: boolean;
};

export type EmergencyContact = {
  id: number;
  employee_id: number;
  name: string;
  relationship: string;
  phone: string | null;
  mobile: string | null;
  address: string | null;
};
export type EmergencyContactInput = {
  name: string;
  relationship: string;
  phone?: string | null;
  mobile?: string | null;
  address?: string | null;
};

export type Education = {
  id: number;
  employee_id: number;
  level: string;
  school: string;
  degree: string | null;
  year_from: number | null;
  year_to: number | null;
  honors: string | null;
};
export type EducationInput = {
  level: string;
  school: string;
  degree?: string | null;
  year_from?: number | null;
  year_to?: number | null;
  honors?: string | null;
};

export type EmploymentHistory = {
  id: number;
  employee_id: number;
  company_name: string;
  position: string;
  from_date: string;
  to_date: string | null;
  reason_for_leaving: string | null;
};
export type EmploymentHistoryInput = {
  company_name: string;
  position: string;
  from_date: string;
  to_date?: string | null;
  reason_for_leaving?: string | null;
};

function nest(employeeId: number, segment: string) {
  return `/api/v1/employees/${employeeId}/${segment}`;
}

export const dependentsApi = {
  list: async (employeeId: number): Promise<Dependent[]> => {
    const { data } = await api.get<Listed<Dependent>>(nest(employeeId, "dependents"));
    return data.data;
  },
  create: async (employeeId: number, body: DependentInput): Promise<Dependent> => {
    const { data } = await api.post<{ data: Dependent }>(nest(employeeId, "dependents"), body);
    return data.data;
  },
  destroy: (employeeId: number, id: number) =>
    api.delete(nest(employeeId, `dependents/${id}`)),
};

export const emergencyContactsApi = {
  list: async (employeeId: number): Promise<EmergencyContact[]> => {
    const { data } = await api.get<Listed<EmergencyContact>>(nest(employeeId, "emergency-contacts"));
    return data.data;
  },
  create: async (employeeId: number, body: EmergencyContactInput): Promise<EmergencyContact> => {
    const { data } = await api.post<{ data: EmergencyContact }>(nest(employeeId, "emergency-contacts"), body);
    return data.data;
  },
  destroy: (employeeId: number, id: number) =>
    api.delete(nest(employeeId, `emergency-contacts/${id}`)),
};

export const educationApi = {
  list: async (employeeId: number): Promise<Education[]> => {
    const { data } = await api.get<Listed<Education>>(nest(employeeId, "education"));
    return data.data;
  },
  create: async (employeeId: number, body: EducationInput): Promise<Education> => {
    const { data } = await api.post<{ data: Education }>(nest(employeeId, "education"), body);
    return data.data;
  },
  destroy: (employeeId: number, id: number) =>
    api.delete(nest(employeeId, `education/${id}`)),
};

export const employmentHistoryApi = {
  list: async (employeeId: number): Promise<EmploymentHistory[]> => {
    const { data } = await api.get<Listed<EmploymentHistory>>(nest(employeeId, "employment-history"));
    return data.data;
  },
  create: async (employeeId: number, body: EmploymentHistoryInput): Promise<EmploymentHistory> => {
    const { data } = await api.post<{ data: EmploymentHistory }>(nest(employeeId, "employment-history"), body);
    return data.data;
  },
  destroy: (employeeId: number, id: number) =>
    api.delete(nest(employeeId, `employment-history/${id}`)),
};

// ── Government IDs (HasOne — single record per employee) ────────────────────

export type GovernmentId = {
  id: number;
  employee_id: number;
  tin: string | null;
  sss_no: string | null;
  philhealth_no: string | null;
  pagibig_no: string | null;
  prc_no: string | null;
  prc_expiry: string | null;
  passport_no: string | null;
  rdo_code: string | null;
  updated_at: string | null;
};

export type GovernmentIdInput = {
  tin?: string | null;
  sss_no?: string | null;
  philhealth_no?: string | null;
  pagibig_no?: string | null;
  prc_no?: string | null;
  prc_expiry?: string | null;
  passport_no?: string | null;
  rdo_code?: string | null;
};

export const governmentIdsApi = {
  get: async (employeeId: number): Promise<GovernmentId | null> => {
    const { data } = await api.get<{ data: GovernmentId | null }>(nest(employeeId, "government-ids"));
    return data.data;
  },
  save: async (employeeId: number, body: GovernmentIdInput): Promise<GovernmentId> => {
    const { data } = await api.put<{ data: GovernmentId }>(nest(employeeId, "government-ids"), body);
    return data.data;
  },
};

// ── Bank Accounts ────────────────────────────────────────────────────────────

export type BankAccount = {
  id: number;
  employee_id: number;
  bank_name: string;
  account_number: string;
  account_name: string;
  is_primary: boolean;
  purpose: string;
  created_at: string | null;
};

export type BankAccountInput = {
  bank_name: string;
  account_number: string;
  account_name: string;
  is_primary?: boolean;
  purpose?: string;
};

export const bankAccountsApi = {
  list: async (employeeId: number): Promise<BankAccount[]> => {
    const { data } = await api.get<Listed<BankAccount>>(nest(employeeId, "bank-accounts"));
    return data.data;
  },
  create: async (employeeId: number, body: BankAccountInput): Promise<BankAccount> => {
    const { data } = await api.post<{ data: BankAccount }>(nest(employeeId, "bank-accounts"), body);
    return data.data;
  },
  destroy: (employeeId: number, id: number) =>
    api.delete(nest(employeeId, `bank-accounts/${id}`)),
};

// ── Contracts ────────────────────────────────────────────────────────────────

export type Contract = {
  id: number;
  employee_id: number;
  contract_type: string;
  effective_from: string;
  effective_to: string | null;
  position_id: number;
  position: { id: number; title: string } | null;
  monthly_rate: string;
  signed_at: string | null;
  created_at: string | null;
};

export type ContractInput = {
  contract_type: string;
  effective_from: string;
  effective_to?: string | null;
  position_id: number | string;
  monthly_rate: number | string;
};

export const contractsApi = {
  list: async (employeeId: number): Promise<Contract[]> => {
    const { data } = await api.get<Listed<Contract>>(nest(employeeId, "contracts"));
    return data.data;
  },
  create: async (employeeId: number, body: ContractInput): Promise<Contract> => {
    const { data } = await api.post<{ data: Contract }>(nest(employeeId, "contracts"), body);
    return data.data;
  },
  destroy: (employeeId: number, id: number) =>
    api.delete(nest(employeeId, `contracts/${id}`)),
};

// ── Performance reviews ──────────────────────────────────────────────────────

export type Performance = {
  id: number;
  employee_id: number;
  review_period_start: string;
  review_period_end: string;
  rating: string | null;
  rating_label: string | null;
  reviewer_employee_id: number | null;
  reviewer_name?: string | null;
  strengths: string | null;
  areas_for_improvement: string | null;
  remarks: string | null;
  next_review_date: string | null;
};

export type PerformanceInput = {
  review_period_start: string;
  review_period_end: string;
  rating?: number | null;
  rating_label?: string | null;
  reviewer_employee_id?: number | null;
  strengths?: string | null;
  areas_for_improvement?: string | null;
  remarks?: string | null;
  next_review_date?: string | null;
};

export const performanceApi = {
  list: async (employeeId: number): Promise<Performance[]> => {
    const { data } = await api.get<Listed<Performance>>(nest(employeeId, "performance"));
    return data.data;
  },
  create: async (employeeId: number, body: PerformanceInput): Promise<Performance> => {
    const { data } = await api.post<{ data: Performance }>(nest(employeeId, "performance"), body);
    return data.data;
  },
  destroy: (employeeId: number, id: number) =>
    api.delete(nest(employeeId, `performance/${id}`)),
};

// ── Photo (stored in the database, not on disk) ──────────────────────────────

export const photoApi = {
  url: (employeeId: number) => `/api/v1/employees/${employeeId}/photo`,

  upload: async (employeeId: number, file: File): Promise<{ photo_url: string }> => {
    const body = new FormData();
    body.append("photo", file);
    // Let axios set Content-Type itself. A hand-written "multipart/form-data"
    // header omits the boundary, and PHP then parses no fields at all.
    const { data } = await api.post<{ photo_url: string }>(
      `/api/v1/employees/${employeeId}/photo`,
      body,
    );
    return data;
  },

  destroy: (employeeId: number) => api.delete(`/api/v1/employees/${employeeId}/photo`),
};

// ── Worksite locations (an employee can be assigned to several) ───────────────

export type EmployeeLocation = {
  id: number;
  employee_id: number;
  branch_id: number;
  branch_name?: string | null;
  code?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  designated_workplace: string | null;
  is_primary: boolean;
};

export type EmployeeLocationInput = {
  branch_id: number;
  designated_workplace?: string | null;
  is_primary?: boolean;
};

export const employeeLocationsApi = {
  list: async (employeeId: number): Promise<EmployeeLocation[]> => {
    const { data } = await api.get<Listed<EmployeeLocation>>(nest(employeeId, "locations"));
    return data.data;
  },
  create: async (employeeId: number, body: EmployeeLocationInput): Promise<EmployeeLocation> => {
    const { data } = await api.post<{ data: EmployeeLocation }>(nest(employeeId, "locations"), body);
    return data.data;
  },
  destroy: (employeeId: number, id: number) =>
    api.delete(nest(employeeId, `locations/${id}`)),
};

// ── Performance goals (forward-looking; distinct from a completed review) ─────

export type PerformanceGoal = {
  id: number;
  employee_id: number;
  goal: string;
  due_date: string | null;
  feedback: string | null;
};

export type PerformanceGoalInput = {
  goal: string;
  due_date?: string | null;
  feedback?: string | null;
};

export const performanceGoalsApi = {
  list: async (employeeId: number): Promise<PerformanceGoal[]> => {
    const { data } = await api.get<Listed<PerformanceGoal>>(nest(employeeId, "performance-goals"));
    return data.data;
  },
  create: async (employeeId: number, body: PerformanceGoalInput): Promise<PerformanceGoal> => {
    const { data } = await api.post<{ data: PerformanceGoal }>(nest(employeeId, "performance-goals"), body);
    return data.data;
  },
  destroy: (employeeId: number, id: number) =>
    api.delete(nest(employeeId, `performance-goals/${id}`)),
};
