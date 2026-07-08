import { api, ensureCsrf } from "./api";
import type { PaginatedList, PaginationMeta } from "./approvals";

export type AccessRequestStatus = "pending" | "approved" | "rejected" | "cancelled";
export type ApprovalStage = "supervisor" | "hr" | "it" | "done";

export type AccessRequestModuleSelection = {
  module: string;
  levels: string[];
};

export type AccessRequestApproval = {
  stage: ApprovalStage;
  sequence: number;
  status: AccessRequestStatus;
  decided_at: string | null;
  remarks: string | null;
  decided_by: { id: number; name: string } | null;
};

export type AccessRequest = {
  id: number;
  request_type: string;
  effective_date: string;
  ticket_number: string | null;
  employee_name: string;
  employee_id_number: string;
  position: string;
  department: string;
  employment_status: string;
  immediate_supervisor: string;
  company_email: string;
  contact_number: string;
  justification: string;
  status: AccessRequestStatus;
  current_stage: ApprovalStage;
  submitted_at: string | null;
  created_at: string;
  requested_by?: { id: number; name: string; email: string } | null;
  modules?: AccessRequestModuleSelection[];
  approvals?: AccessRequestApproval[];
};

export type AccessRequestStats = {
  totals: {
    total: number;
    pending: number;
    approved: number;
    disapproved: number;
  };
  queues: Partial<Record<"supervisor" | "hr" | "it", number>>;
};

export type CreateAccessRequestInput = {
  request_type: string;
  effective_date: string;
  ticket_number?: string | null;
  employee_name: string;
  employee_id_number: string;
  position: string;
  department: string;
  employment_status: string;
  immediate_supervisor: string;
  company_email: string;
  contact_number: string;
  justification: string;
  modules: Record<string, string[]>;
};

export async function createAccessRequest(
  input: CreateAccessRequestInput,
): Promise<AccessRequest> {
  await ensureCsrf();
  const { data } = await api.post<{ data: AccessRequest }>(
    "/api/v1/access-requests",
    input,
  );
  return data.data;
}

export async function getAccessRequests(params?: {
  status?: string;
  stage?: string;
  page?: number;
}): Promise<PaginatedList<AccessRequest>> {
  const { data } = await api.get<{ data: AccessRequest[]; meta?: PaginationMeta }>(
    "/api/v1/access-requests",
    { params },
  );
  return { data: data.data, meta: data.meta };
}

export async function getMyAccessRequests(): Promise<AccessRequest[]> {
  const { data } = await api.get<{ data: AccessRequest[] }>(
    "/api/v1/my/access-requests",
  );
  return data.data;
}

export async function cancelAccessRequest(id: number): Promise<AccessRequest> {
  await ensureCsrf();
  const { data } = await api.post<{ data: AccessRequest }>(
    `/api/v1/access-requests/${id}/cancel`,
    {},
  );
  return data.data;
}

export async function getAccessRequestStats(): Promise<AccessRequestStats> {
  const { data } = await api.get<AccessRequestStats>(
    "/api/v1/access-requests/stats",
  );
  return data;
}

export async function getAccessRequest(id: number): Promise<AccessRequest> {
  const { data } = await api.get<{ data: AccessRequest }>(
    `/api/v1/access-requests/${id}`,
  );
  return data.data;
}

export async function decideAccessRequest(
  id: number,
  decision: "approve" | "reject",
  remarks?: string,
): Promise<AccessRequest> {
  await ensureCsrf();
  const { data } = await api.post<{ data: AccessRequest }>(
    `/api/v1/access-requests/${id}/${decision}`,
    { remarks },
  );
  return data.data;
}
