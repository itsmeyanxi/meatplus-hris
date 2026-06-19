import { api } from "./api";

export type Device = {
  id: number;
  name: string;
  vendor: string;
  serial_no: string | null;
  ip_address: string;
  port: number;
  timezone: string | null;
  username: string;
  is_active: boolean;
  branch_id: number | null;
  last_synced_at: string | null;
  last_event_at: string | null;
  created_at: string | null;
};

export type DeviceInput = {
  name: string;
  ip_address: string;
  port: number;
  timezone: string;
  username: string;
  password?: string; // blank on edit = keep stored credential
  serial_no?: string | null;
  is_active: boolean;
};

export type DeviceInfo = {
  name: string | null;
  model: string | null;
  serial: string | null;
  firmware: string | null;
  mac: string | null;
};

export type SyncSummary = {
  device: string;
  window: [string, string];
  events_seen: number;
  inserted: number;
  duplicates: number;
  unmapped: Record<string, number>;
  employees_recomputed: number;
};

export type EnrolledUser = {
  device_employee_no: string;
  device_name: string | null;
  matched_employee: { id: number; employee_no: string; name: string } | null;
};

type Listed<T> = { data: T[] };

const base = "/api/v1/attendance-devices";

export const devicesApi = {
  list: async (): Promise<Device[]> => {
    const { data } = await api.get<Listed<Device>>(base);
    return data.data;
  },
  create: async (body: DeviceInput): Promise<Device> => {
    const { data } = await api.post<{ data: Device }>(base, body);
    return data.data;
  },
  update: async (id: number, body: Partial<DeviceInput>): Promise<Device> => {
    const { data } = await api.put<{ data: Device }>(`${base}/${id}`, body);
    return data.data;
  },
  remove: async (id: number): Promise<void> => {
    await api.delete(`${base}/${id}`);
  },
  test: async (id: number): Promise<{ ok: boolean; info?: DeviceInfo }> => {
    const { data } = await api.post(`${base}/${id}/test`);
    return data;
  },
  sync: async (id: number): Promise<{ ok: boolean; summary?: SyncSummary }> => {
    const { data } = await api.post(`${base}/${id}/sync`);
    return data;
  },
  users: async (id: number): Promise<EnrolledUser[]> => {
    const { data } = await api.get<{ ok: boolean; users: EnrolledUser[] }>(`${base}/${id}/users`);
    return data.users;
  },
};
