import { api } from "./api";

export type EmployeeRecordType =
  | "advance"
  | "training"
  | "memo"
  | "seminar"
  | "movement"
  | "medical_record"
  | "requirements";

// Each row is { id } plus whatever fields the section stored.
export type RecordRow = { id: number } & Record<string, string | number | boolean | null>;

const base = (employeeId: number, type: EmployeeRecordType) =>
  `/api/v1/employees/${employeeId}/records/${type}`;

export const employeeRecordsApi = {
  list: async (employeeId: number, type: EmployeeRecordType): Promise<RecordRow[]> =>
    (await api.get<{ data: RecordRow[] }>(base(employeeId, type))).data.data,

  create: async (employeeId: number, type: EmployeeRecordType, data: Record<string, unknown>): Promise<RecordRow> =>
    (await api.post<{ data: RecordRow }>(base(employeeId, type), { data })).data.data,

  update: async (employeeId: number, type: EmployeeRecordType, id: number, data: Record<string, unknown>): Promise<RecordRow> =>
    (await api.put<{ data: RecordRow }>(`${base(employeeId, type)}/${id}`, { data })).data.data,

  destroy: (employeeId: number, type: EmployeeRecordType, id: number) =>
    api.delete(`${base(employeeId, type)}/${id}`),
};
