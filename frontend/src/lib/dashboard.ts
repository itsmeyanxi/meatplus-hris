import { api } from "./api";

export type PendingSummary = {
  pending_total: number;
  leaves: number;
  attendance: number;
};

// The signed-in user's own pending request counts (one call, server-aggregated).
export async function getPendingSummary(): Promise<PendingSummary> {
  const { data } = await api.get<PendingSummary>("/api/v1/my/pending-summary");
  return data;
}

export type AdminStats = {
  headcount: number;
  headcount_organic: number;
  headcount_agency: number;
  headcount_project_crew: number;
  no_access: number;
  pending_leaves: number;
  today_present: number;
  pending_attendance: number;
  pending_access_requests: number;
};

export async function getAdminStats(): Promise<AdminStats> {
  const { data } = await api.get<AdminStats>("/api/v1/admin/stats");
  return data;
}
