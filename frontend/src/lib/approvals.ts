import { api } from "./api";

export type RequestStatus = "pending" | "approved" | "rejected" | "cancelled" | "resubmitted";

export type PaginationMeta = {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
};

export type PaginatedList<T> = { data: T[]; meta?: PaginationMeta };

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

export type OTClassification = "early" | "normal";

export type OvertimeRequest = BaseRequest & {
  date: string;
  start_time: string;
  end_time: string;
  requested_hours: string;
  reason: string;
  classification: OTClassification;
  attachment_path: string | null;
};
export type OvertimeInput = {
  employee_id?: number;
  date: string;
  start_time: string;
  end_time: string;
  requested_hours: number;
  reason: string;
  classification: OTClassification;
  ticket_number?: string;
  attachment?: File | null;
};

export type UndertimeRequest = OvertimeRequest;
export type UndertimeInput = OvertimeInput;

export type OfficialBusinessRequest = BaseRequest & {
  date: string;
  date_to: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string;
  purpose: string;
};
export type OfficialBusinessInput = {
  employee_id?: number;
  date: string;
  date_to?: string | null;
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

export type ListFilters = { status?: RequestStatus; employee_id?: number; from?: string; to?: string; page?: number };

function makeApi<TList, TInput>(slug: string) {
  return {
    list: async (params: ListFilters = {}): Promise<PaginatedList<TList>> => {
      const { data } = await api.get<{ data: TList[]; meta?: PaginationMeta }>(`/api/v1/${slug}`, { params });
      return { data: data.data, meta: data.meta };
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

export const overtimeApi = {
  ...makeApi<OvertimeRequest, OvertimeInput>("overtime-requests"),
  create: async (body: OvertimeInput): Promise<OvertimeRequest> => {
    const fd = new FormData();
    if (body.employee_id != null) fd.append("employee_id", String(body.employee_id));
    fd.append("date", body.date);
    fd.append("start_time", body.start_time);
    fd.append("end_time", body.end_time);
    fd.append("requested_hours", String(body.requested_hours));
    fd.append("reason", body.reason);
    fd.append("classification", body.classification);
    if (body.ticket_number) fd.append("ticket_number", body.ticket_number);
    if (body.attachment) fd.append("attachment", body.attachment);
    const { data } = await api.post<{ data: OvertimeRequest }>("/api/v1/overtime-requests", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data.data;
  },
  attachmentUrl: (id: number) => `/api/v1/overtime-requests/${id}/attachment`,
  importTemplateUrl: "/api/v1/overtime-requests/import/template",
  import: async (file: File): Promise<{ created: number; skipped: number; total: number; errors: { row: number; message: string }[] }> => {
    const fd = new FormData();
    fd.append("file", file);
    const { data } = await api.post("/api/v1/overtime-requests/import", fd);
    return data;
  },
};
export const undertimeApi = makeApi<UndertimeRequest, UndertimeInput>("undertime-requests");
export const officialBusinessApi = makeApi<OfficialBusinessRequest, OfficialBusinessInput>("official-business-requests");
export const certificateOfAttendanceApi = makeApi<CertificateOfAttendanceRequest, CertificateOfAttendanceInput>(
  "certificate-of-attendance-requests",
);
export const correctionsApi = makeApi<AttendanceCorrection, CorrectionInput>("attendance-corrections");
