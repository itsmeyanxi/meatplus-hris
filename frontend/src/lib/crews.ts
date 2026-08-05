import { api } from "./api";

/** A project crew (BLAST, ICE, CUTTER, …) with headcount + today's attendance. */
export type CrewCard = {
  id: number;
  code?: string | null;
  name: string;
  headcount: number;
  present_today: number;
};

export async function listCrews(): Promise<{ date: string; data: CrewCard[] }> {
  const { data } = await api.get<{ date: string; data: CrewCard[] }>("/api/v1/crews");
  return data;
}

export type CrewTodayRow = {
  id: number;
  employee_no: string;
  name: string;
  biometric_id: string | null;
  time_in: string | null;
  time_out: string | null;
  punches: number;
  status: "complete" | "no_out" | "no_punch";
};

export type CrewToday = {
  date: string;
  agency: { id: number; name: string; code?: string | null }; // shape shared with the agency board
  summary: { headcount: number; present: number; complete: number; no_out: number; no_punch: number };
  employees: CrewTodayRow[];
};

export async function getCrewToday(branchId: number): Promise<CrewToday> {
  const { data } = await api.get<CrewToday>(`/api/v1/crews/${branchId}/today`);
  return data;
}

export type NewCrewEmployee = {
  employee_no: string;
  first_name: string;
  last_name: string;
  middle_name?: string;
  biometric_user_id?: string;
  position?: string;
  date_hired?: string;
};

export async function addCrewEmployee(branchId: number, payload: NewCrewEmployee): Promise<{ id: number; message: string }> {
  const { data } = await api.post<{ id: number; message: string }>(`/api/v1/crews/${branchId}/employees`, payload);
  return data;
}
