import { api } from "./api";

export type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";

type Person = { id: number; employee_no: string; full_name: string };
type Actor = { id: number; name: string };

type BaseRequest = {
  id: number;
  employee_id: number;
  employee?: Person;
  status: RequestStatus;
  approved_by?: Actor | null;
  filed_by?: Actor | null;
  decided_at: string | null;
  decision_remarks: string | null;
  created_at: string;
};

export type OvertimeRequest = BaseRequest & {
  date: string;
  start_time: string;
  end_time: string;
  requested_hours: string;
  reason: string;
};
export type OvertimeInput = {
  employee_id?: number;
  date: string;
  start_time: string;
  end_time: string;
  requested_hours: number;
  reason: string;
};

export type UndertimeRequest = OvertimeRequest;
export type UndertimeInput = OvertimeInput;

export type OfficialBusinessRequest = BaseRequest & {
  date: string;
  start_time: string | null;
  end_time: string | null;
  location: string;
  purpose: string;
};
export type OfficialBusinessInput = {
  employee_id?: number;
  date: string;
  start_time?: string | null;
  end_time?: string | null;
  location: string;
  purpose: string;
};

export type CertificateOfAttendanceRequest = BaseRequest & {
  work_date: string;
  missed_punch: "in" | "out" | "both";
  claimed_time_in: string | null;
  claimed_time_out: string | null;
  reason: string;
};
export type CertificateOfAttendanceInput = {
  employee_id?: number;
  work_date: string;
  missed_punch: "in" | "out" | "both";
  claimed_time_in?: string | null;
  claimed_time_out?: string | null;
  reason: string;
};

export type AttendanceCorrection = BaseRequest & {
  work_date: string;
  field_to_correct: string;
  old_value: string | null;
  new_value: string;
  reason: string;
};
export type CorrectionInput = {
  employee_id?: number;
  work_date: string;
  field_to_correct: string;
  old_value?: string | null;
  new_value: string;
  reason: string;
};

type Listed<T> = { data: T[] };
export type ListFilters = { status?: RequestStatus; employee_id?: number; from?: string; to?: string };

function makeApi<TList, TInput>(slug: string) {
  return {
    list: async (params: ListFilters = {}): Promise<TList[]> => {
      const { data } = await api.get<Listed<TList>>(`/api/v1/${slug}`, { params });
      return data.data;
    },
    get: async (id: number): Promise<TList> => {
      const { data } = await api.get<{ data: TList }>(`/api/v1/${slug}/${id}`);
      return data.data;
    },
    create: async (body: TInput): Promise<TList> => {
      const { data } = await api.post<{ data: TList }>(`/api/v1/${slug}`, body);
      return data.data;
    },
    approve: async (id: number, decision_remarks?: string): Promise<TList> => {
      const { data } = await api.post<{ data: TList }>(`/api/v1/${slug}/${id}/approve`, { decision_remarks });
      return data.data;
    },
    reject: async (id: number, decision_remarks?: string): Promise<TList> => {
      const { data } = await api.post<{ data: TList }>(`/api/v1/${slug}/${id}/reject`, { decision_remarks });
      return data.data;
    },
    cancel: async (id: number): Promise<TList> => {
      const { data } = await api.post<{ data: TList }>(`/api/v1/${slug}/${id}/cancel`, {});
      return data.data;
    },
  };
}

export const overtimeApi = makeApi<OvertimeRequest, OvertimeInput>("overtime-requests");
export const undertimeApi = makeApi<UndertimeRequest, UndertimeInput>("undertime-requests");
export const officialBusinessApi = makeApi<OfficialBusinessRequest, OfficialBusinessInput>("official-business-requests");
export const certificateOfAttendanceApi = makeApi<CertificateOfAttendanceRequest, CertificateOfAttendanceInput>(
  "certificate-of-attendance-requests",
);
export const correctionsApi = makeApi<AttendanceCorrection, CorrectionInput>("attendance-corrections");
