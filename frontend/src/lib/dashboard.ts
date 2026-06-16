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
