import { api } from "./api";

type Listed<T> = { data: T[] };

export type WorkScheduleDay = {
  day_of_week: number;
  is_rest_day: boolean;
  time_in: string | null;
  time_out: string | null;
  break_minutes: number;
  required_hours: number;
};

export type WorkSchedule = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_flexible: boolean;
  breaks_paid: boolean;
  weekly_workdays: number;
  is_active: boolean;
  days?: WorkScheduleDay[];
};

export type Holiday = {
  id: number;
  holiday_date: string;
  name: string;
  type: "regular" | "special_non_working" | "special_working" | "local";
  applicable_branch_id: number | null;
};
export type HolidayInput = {
  holiday_date: string;
  name: string;
  type: Holiday["type"];
  applicable_branch_id?: number | null;
};

// Geofence verdict for a located punch vs the employee's branch pin.
// null when the punch has no coordinates or the branch has no pin set yet.
export type GeoVerdict = {
  distance_m: number;
  radius_m: number;
  outside: boolean;
  branch_name: string;
};

export type TimeLog = {
  id: number;
  employee_id: number;
  logged_at: string;
  direction: "in" | "out" | "break_out" | "break_in";
  source: "biometric" | "web" | "mobile" | "manual";
  device_id: string | null;
  lat: number | null;
  lng: number | null;
  geo: GeoVerdict | null;
};
export type TimeLogInput = {
  employee_id: number;
  logged_at: string;
  direction: TimeLog["direction"];
  source?: TimeLog["source"];
};

export type DayStatus =
  | "present"
  | "late"
  | "absent"
  | "leave"
  | "holiday"
  | "rest_day"
  | "no_record";

export type DailyTimeRecord = {
  id: number;
  employee_id: number;
  employee?: { id: number; employee_no: string; full_name: string };
  work_date: string;
  scheduled_in: string | null;
  scheduled_out: string | null;
  actual_in: string | null;
  actual_out: string | null;
  hours_worked: string;
  late_minutes: number;
  undertime_minutes: number;
  overtime_minutes: number;
  night_diff_minutes: number;
  holiday_type: string | null;
  holiday_name?: string | null;
  is_rest_day: boolean;
  is_adjusted?: boolean;
  is_absent: boolean;
  is_on_leave: boolean;
  status: "draft" | "posted" | "locked";
  day_status?: DayStatus;
  remarks: string | null;
};

export type AttendanceSummary = {
  present: number;
  late: number;
  absent: number;
  leave: number;
  holiday: number;
  rest_day: number;
};

export type ScheduleAssignment = {
  id: number;
  work_schedule: { id: number; code: string; name: string };
  effective_from: string;
  effective_to: string | null;
};

export type WorkScheduleDayInput = {
  day_of_week: number;
  is_rest_day: boolean;
  time_in: string | null;
  time_out: string | null;
  /** Break window. The API derives break_minutes from it. */
  break_start?: string | null;
  break_end?: string | null;
  break_minutes?: number;
  required_hours?: number;
};

export type WorkScheduleInput = {
  code: string;
  name: string;
  description?: string | null;
  is_flexible?: boolean;
  breaks_paid?: boolean;
  weekly_workdays?: number;
  /** "No of hours to work including break hours". */
  hours_per_day?: number | null;
  is_active?: boolean;
  days?: WorkScheduleDayInput[];
};

export const workSchedulesApi = {
  list: async (): Promise<WorkSchedule[]> => {
    const { data } = await api.get<Listed<WorkSchedule>>("/api/v1/work-schedules");
    return data.data;
  },
  create: async (body: WorkScheduleInput): Promise<WorkSchedule> => {
    const { data } = await api.post<{ data: WorkSchedule }>("/api/v1/work-schedules", body);
    return data.data;
  },
  update: async (id: number, body: WorkScheduleInput): Promise<WorkSchedule> => {
    const { data } = await api.put<{ data: WorkSchedule }>(`/api/v1/work-schedules/${id}`, body);
    return data.data;
  },
  destroy: (id: number) => api.delete(`/api/v1/work-schedules/${id}`),
};

export const holidaysApi = {
  list: async (params: { from?: string; to?: string } = {}): Promise<Holiday[]> => {
    const { data } = await api.get<Listed<Holiday>>("/api/v1/holidays", { params });
    return data.data;
  },
  create: async (body: HolidayInput): Promise<Holiday> => {
    const { data } = await api.post<{ data: Holiday }>("/api/v1/holidays", body);
    return data.data;
  },
  update: async (id: number, body: HolidayInput): Promise<Holiday> => {
    const { data } = await api.put<{ data: Holiday }>(`/api/v1/holidays/${id}`, body);
    return data.data;
  },
  destroy: (id: number) => api.delete(`/api/v1/holidays/${id}`),
};

export const timeLogsApi = {
  list: async (params: { employee_id?: number; from?: string; to?: string } = {}): Promise<TimeLog[]> => {
    const { data } = await api.get<Listed<TimeLog>>("/api/v1/time-logs", { params });
    return data.data;
  },
  create: async (body: TimeLogInput): Promise<TimeLog> => {
    const { data } = await api.post<{ data: TimeLog }>("/api/v1/time-logs", body);
    return data.data;
  },
};

export const dtrApi = {
  list: async (params: { employee_id?: number; department_id?: number; from?: string; to?: string } = {}): Promise<DailyTimeRecord[]> => {
    const { data } = await api.get<Listed<DailyTimeRecord>>("/api/v1/daily-time-records", { params });
    return data.data;
  },
  compute: async (body: { employee_id: number; from: string; to: string }): Promise<DailyTimeRecord[]> => {
    const { data } = await api.post<Listed<DailyTimeRecord>>("/api/v1/daily-time-records/compute", body);
    return data.data;
  },
};

export const myAttendanceApi = {
  // Self-service: the logged-in user's own DTRs + summary for a date range.
  list: async (
    from: string,
    to: string,
  ): Promise<{ data: DailyTimeRecord[]; summary: AttendanceSummary }> => {
    const { data } = await api.get<{
      data: DailyTimeRecord[];
      summary: AttendanceSummary;
    }>("/api/v1/my/daily-time-records", { params: { from, to } });
    return data;
  },
};

// ── Web time clock (self-service: clock IN / OUT from the dashboard) ──────────

export type TimeClockPunch = {
  id: number;
  direction: "in" | "out";
  logged_at: string;
  source: "biometric" | "web" | "mobile" | "manual";
  lat: number | null;
  lng: number | null;
  geo: GeoVerdict | null;
};

export type TimeClockStatus = {
  state: "in" | "out"; // "in" = currently clocked in
  clocked_in_at: string | null;
  last_punch_at: string | null;
  server_time: string;
  punches: TimeClockPunch[];
};

export const myTimeClockApi = {
  today: async (): Promise<TimeClockStatus> => {
    const { data } = await api.get<{ data: TimeClockStatus }>("/api/v1/my/time-clock");
    return data.data;
  },
  punch: async (
    direction: "in" | "out",
    coords?: { lat: number; lng: number },
  ): Promise<{ data: TimeClockStatus; message: string }> => {
    const { data } = await api.post<{ data: TimeClockStatus; message: string }>(
      "/api/v1/my/time-clock",
      { direction, ...(coords ?? {}) },
    );
    return data;
  },
};

// ── Branch geofence administration (worksite GPS pin + allowed radius) ────────

export type BranchGeofence = {
  id: number;
  code: string | null;
  name: string;
  city: string | null;
  province: string | null;
  is_head_office: boolean;
  is_active: boolean;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_m: number | null;
  effective_radius_m: number;
  has_pin: boolean;
};

export type BranchGeofenceInput = {
  latitude: number | null;
  longitude: number | null;
  geofence_radius_m: number | null;
};

export const branchesAdminApi = {
  list: async (): Promise<BranchGeofence[]> => {
    const { data } = await api.get<Listed<BranchGeofence>>("/api/v1/branches");
    return data.data;
  },
  update: async (id: number, body: BranchGeofenceInput): Promise<BranchGeofence> => {
    const { data } = await api.patch<{ data: BranchGeofence }>(`/api/v1/branches/${id}`, body);
    return data.data;
  },
};

// ── Admin-uploaded time logs awaiting approval ───────────────────────────────

export type TimeLogRequest = {
  id: number;
  batch_id: string;
  employee_id: number;
  employee?: { id: number; employee_no: string; full_name: string };
  work_date: string;
  time_in: string | null;
  time_out: string | null;
  status: "pending" | "approved" | "rejected";
  note: string | null;
  uploaded_by_name?: string;
  decided_at: string | null;
  decision_remarks: string | null;
  created_at: string | null;
};

export type TimeLogImportResult = {
  batch_id: string;
  created: number;
  total: number;
  errors: { row: number; message: string }[];
};

export const timeLogRequestsApi = {
  list: async (status: "pending" | "approved" | "rejected" = "pending"): Promise<TimeLogRequest[]> => {
    const { data } = await api.get<Listed<TimeLogRequest>>("/api/v1/time-log-requests", { params: { status } });
    return data.data;
  },
  import: async (file: File): Promise<TimeLogImportResult> => {
    const fd = new FormData();
    fd.append("file", file);
    const { data } = await api.post<TimeLogImportResult>("/api/v1/time-log-requests/import", fd);
    return data;
  },
  approve: (id: number) => api.post(`/api/v1/time-log-requests/${id}/approve`, {}),
  reject: (id: number, decision_remarks?: string) =>
    api.post(`/api/v1/time-log-requests/${id}/reject`, { decision_remarks }),
  approveBatch: (batch_id: string) =>
    api.post("/api/v1/time-log-requests/approve-batch", { batch_id }),
  templateUrl: "/api/v1/time-log-requests/template",
};

export const employeeSchedulesApi = {
  list: async (employeeId: number): Promise<ScheduleAssignment[]> => {
    const { data } = await api.get<Listed<ScheduleAssignment>>(
      `/api/v1/employees/${employeeId}/schedule-assignments`,
    );
    return data.data;
  },
  create: async (
    employeeId: number,
    body: { work_schedule_id: number; effective_from: string; effective_to?: string | null },
  ): Promise<ScheduleAssignment> => {
    const { data } = await api.post<{ data: ScheduleAssignment }>(
      `/api/v1/employees/${employeeId}/schedule-assignments`,
      body,
    );
    return data.data;
  },
  destroy: (employeeId: number, id: number) =>
    api.delete(`/api/v1/employees/${employeeId}/schedule-assignments/${id}`),
};

export type ShiftAdjustment = {
  id: number;
  employee_id: number;
  work_date: string;
  is_rest_day: boolean;
  time_in: string | null;
  time_out: string | null;
  break_minutes: number;
  reason: string | null;
};

export type ShiftAdjustmentInput = {
  work_date: string;
  is_rest_day?: boolean;
  time_in?: string | null;
  time_out?: string | null;
  break_minutes?: number;
  reason?: string | null;
};

export const shiftAdjustmentsApi = {
  list: async (employeeId: number): Promise<ShiftAdjustment[]> => {
    const { data } = await api.get<Listed<ShiftAdjustment>>(
      `/api/v1/employees/${employeeId}/shift-adjustments`,
    );
    return data.data;
  },
  create: async (employeeId: number, body: ShiftAdjustmentInput): Promise<ShiftAdjustment> => {
    const { data } = await api.post<{ data: ShiftAdjustment }>(
      `/api/v1/employees/${employeeId}/shift-adjustments`,
      body,
    );
    return data.data;
  },
  destroy: (employeeId: number, id: number) =>
    api.delete(`/api/v1/employees/${employeeId}/shift-adjustments/${id}`),
};

// ── Schedule adjustment requests (employee-filed, approval-based) ─────────

export type SchedAdjStatus = "pending" | "approved" | "rejected" | "cancelled" | "resubmitted";

export type ScheduleAdjustmentReq = {
  id: number;
  employee_id: number;
  employee?: { id: number; employee_no: string; full_name: string };
  from_date: string;
  to_date: string;
  shift_start: string;
  break_start: string | null;
  break_end: string | null;
  shift_end: string;
  reason: string | null;
  status: SchedAdjStatus;
  decided_by?: { id: number; name: string } | null;
  decided_at: string | null;
  decision_remarks: string | null;
  filed_by_user_id: number | null;
  created_at: string;
};

export type ScheduleAdjustmentReqInput = {
  employee_id?: number;
  from_date: string;
  to_date: string;
  shift_start: string;
  break_start?: string | null;
  break_end?: string | null;
  shift_end: string;
  reason?: string | null;
};

export type SchedAdjPaginationMeta = {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
};

export const schedAdjApi = {
  list: async (params: { status?: string; employee_id?: number; page?: number } = {}): Promise<{ data: ScheduleAdjustmentReq[]; meta?: SchedAdjPaginationMeta }> => {
    const { data } = await api.get<{ data: ScheduleAdjustmentReq[]; meta?: SchedAdjPaginationMeta }>("/api/v1/schedule-adjustment-requests", { params });
    return { data: data.data, meta: data.meta };
  },
  create: async (body: ScheduleAdjustmentReqInput): Promise<ScheduleAdjustmentReq> => {
    const { data } = await api.post<{ data: ScheduleAdjustmentReq }>("/api/v1/schedule-adjustment-requests", body);
    return data.data;
  },
  approve: async (id: number, remarks?: string): Promise<ScheduleAdjustmentReq> => {
    const { data } = await api.post<{ data: ScheduleAdjustmentReq }>(`/api/v1/schedule-adjustment-requests/${id}/approve`, { decision_remarks: remarks });
    return data.data;
  },
  reject: async (id: number, remarks?: string): Promise<ScheduleAdjustmentReq> => {
    const { data } = await api.post<{ data: ScheduleAdjustmentReq }>(`/api/v1/schedule-adjustment-requests/${id}/reject`, { decision_remarks: remarks });
    return data.data;
  },
  cancel: async (id: number): Promise<ScheduleAdjustmentReq> => {
    const { data } = await api.post<{ data: ScheduleAdjustmentReq }>(`/api/v1/schedule-adjustment-requests/${id}/cancel`);
    return data.data;
  },
};
