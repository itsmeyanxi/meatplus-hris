import { api } from "./api";

export type BiometricAnomaly = {
  id: number;
  employee: {
    id: number | null;
    name: string;
    employee_no: string | null;
    biometric_user_id: string | null;
  };
  pin: string;
  device_key: string | null;
  device_name: string | null;
  punches: number;
  detail: string | null;
  detected_at: string | null;
  resolved_at: string | null;
};

export type RescanResult = { new: number; ongoing: number; resolved: number };

export const biometricAnomaliesApi = {
  list: (includeResolved = false) =>
    api
      .get<{ data: BiometricAnomaly[] }>("/api/v1/attendance/biometric-anomalies", {
        params: includeResolved ? { include_resolved: 1 } : undefined,
      })
      .then((r) => r.data.data),
  rescan: () =>
    api.post<RescanResult>("/api/v1/attendance/biometric-anomalies/rescan").then((r) => r.data),
  resolve: (id: number) =>
    api.post(`/api/v1/attendance/biometric-anomalies/${id}/resolve`),
};
