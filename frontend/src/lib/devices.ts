import { api } from "./api";

export type Device = {
  id: number;
  name: string;
  vendor: string;
  serial_no: string | null;
  ip_address: string;
  port: number;
  timezone: string | null;
  use_server_time: boolean;
  username: string;
  is_active: boolean;
  company_id: number;
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
  use_server_time: boolean;
  username: string;
  password?: string; // blank on edit = keep stored credential
  serial_no?: string | null;
  company_id?: number;
  branch_id?: number | null;
  is_active: boolean;
};

export type DeviceLookup = { id: number; name: string; code?: string };

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
  // Lookups for the company/branch selectors (tenancy-checked server-side).
  companies: async (): Promise<DeviceLookup[]> => {
    const { data } = await api.get<Listed<DeviceLookup>>("/api/v1/lookups/companies");
    return data.data;
  },
  branches: async (companyId: number): Promise<DeviceLookup[]> => {
    const { data } = await api.get<Listed<DeviceLookup>>(`/api/v1/lookups/branches?company_id=${companyId}`);
    return data.data;
  },
  /** Connection health for every terminal — is it talking to us, and is what it sends landing on a person. */
  report: async (): Promise<ConnectionReport> => {
    const { data } = await api.get<ConnectionReport>(`${base}/report`);
    return data;
  },
  downloadReport: async () => {
    const { data } = await api.get<Blob>(`${base}/report?format=csv`, { responseType: "blob" });
    const href = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = href;
    a.download = `biometric_connection_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(href);
  },
};

/** live = pushed within the hour · idle = same day · quiet = 1–2 days · offline = 3+ days */
export type DeviceState = "live" | "idle" | "quiet" | "offline" | "never";

export type DeviceHealth = {
  id: number;
  name: string;
  serial_no: string | null;
  vendor: string | null;
  company: string | null;
  is_active: boolean;
  last_event_at: string | null;
  silent_minutes: number | null;
  state: DeviceState;
  punches_today: number;
  punches_7d: number;
  punches_30d: number;
  employees_30d: number;
  /** % of what the device sent in 30 days that actually matched an employee. */
  match_rate: number | null;
  staged_pending: number;
  staged_pins: number;
  /** One plain sentence when a human is needed, otherwise null. */
  attention: string | null;
};

export type ConnectionReport = {
  devices: DeviceHealth[];
  summary: {
    generated_at: string;
    total: number;
    live: number;
    idle: number;
    quiet: number;
    offline: number;
    never: number;
    pending_devices: number;
    punches_today: number;
    staged_pending: number;
    needs_attention: number;
  };
};
