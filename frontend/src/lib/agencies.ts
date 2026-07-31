import { api } from "./api";

export type AgencyCard = {
  id: number;
  code?: string | null;
  name: string;
  headcount: number;
  present_today: number;
};

export async function listAgencies(): Promise<{ date: string; data: AgencyCard[] }> {
  const { data } = await api.get<{ date: string; data: AgencyCard[] }>("/api/v1/agencies");
  return data;
}

export type AgencyTodayRow = {
  id: number;
  employee_no: string;
  name: string;
  biometric_id: string | null;
  time_in: string | null;
  time_out: string | null;
  punches: number;
  status: "complete" | "no_out" | "no_punch";
};

export type AgencyToday = {
  date: string;
  agency: { id: number; name: string; code?: string | null };
  summary: { headcount: number; present: number; complete: number; no_out: number; no_punch: number };
  employees: AgencyTodayRow[];
};

export async function getAgencyToday(branchId: number): Promise<AgencyToday> {
  const { data } = await api.get<AgencyToday>(`/api/v1/agencies/${branchId}/today`);
  return data;
}

export type NewAgencyEmployee = {
  employee_no: string;
  first_name: string;
  last_name: string;
  middle_name?: string;
  biometric_user_id?: string;
  position?: string;
  date_hired?: string;
};

export async function addAgencyEmployee(branchId: number, payload: NewAgencyEmployee): Promise<{ id: number; message: string }> {
  const { data } = await api.post<{ id: number; message: string }>(`/api/v1/agencies/${branchId}/employees`, payload);
  return data;
}

export type AgencyAttendanceRow = {
  employee_no: string;
  name: string;
  date: string;
  day: string;
  shift_start: string | null;
  shift_end: string | null;
  hours: number | null;
  late: number;
  ot: number;
  status: string;
};

export type AgencyAttendanceData = {
  agency: { id: number; name: string };
  from: string;
  to: string;
  summary: { employees: number; present_days: number; absent_days: number; leave_days: number; total_hours: number };
  rows: AgencyAttendanceRow[];
};

export async function getAgencyAttendanceData(params: { branchId: number; dateFrom: string; dateTo: string; employeeId?: number }): Promise<AgencyAttendanceData> {
  const { data } = await api.get<AgencyAttendanceData>("/api/v1/reports/agency-attendance-data", {
    params: { branch_id: params.branchId, date_from: params.dateFrom, date_to: params.dateTo, employee_id: params.employeeId || undefined },
  });
  return data;
}
