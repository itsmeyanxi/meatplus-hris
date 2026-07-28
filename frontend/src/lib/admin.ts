import { api } from "./api";

export type AdminCompany = {
  id: number;
  code: string;
  name: string;
  is_demo: boolean;
  employees: number;
  with_login: number;
  punches_today: number;
  present_today: number;
  pending_approvals: number;
  latest_run: { name: string; status: string; period: string } | null;
  gaps: { no_salary: number; no_bank: number; no_gov: number; no_position: number; no_schedule: number };
};

export type AdminRecentRun = {
  id: number;
  company: string | null;
  name: string;
  status: string;
  period: string;
  payslips: number;
  gross: number;
  net: number;
};

export type AdminOverview = {
  generated_at: string;
  totals: { companies: number; employees: number; with_login: number; pending_approvals: number };
  companies: AdminCompany[];
  recent_runs: AdminRecentRun[];
  system: {
    latest_punch: string | null;
    punches_24h: number;
    mail_pending: number;
    mail_failed: number;
    logins_24h: number;
    active_users: number;
    server_time: string;
  };
};

export const adminApi = {
  overview: async (): Promise<AdminOverview> => (await api.get<AdminOverview>("/api/v1/admin/overview")).data,
};
