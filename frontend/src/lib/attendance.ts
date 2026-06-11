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

export type TimeLog = {
  id: number;
  employee_id: number;
  logged_at: string;
  direction: "in" | "out" | "break_out" | "break_in";
  source: "biometric" | "web" | "mobile" | "manual";
  device_id: string | null;
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

export const workSchedulesApi = {
  list: async (): Promise<WorkSchedule[]> => {
    const { data } = await api.get<Listed<WorkSchedule>>("/api/v1/work-schedules");
    return data.data;
  },
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
  list: async (params: { employee_id?: number; from?: string; to?: string } = {}): Promise<DailyTimeRecord[]> => {
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
