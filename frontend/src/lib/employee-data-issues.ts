import { api } from "./api";

export type Severity = "high" | "medium" | "low";

export type EmployeeDataIssue = {
  id: number;
  employee: { id: number | null; name: string; employee_no: string | null };
  category: string;
  severity: Severity;
  detail: string | null;
  detected_at: string | null;
  resolved_at: string | null;
  ignored: boolean;
};

export type IssueRescanResult = { new: number; ongoing: number; resolved: number; open: number };

/** Human labels for the detector's category codes. */
export const ISSUE_LABELS: Record<string, string> = {
  missing_compensation: "No compensation",
  missing_employment_type: "No employment type",
  missing_position: "No position",
  missing_department: "No department",
  missing_biometric_id: "No biometric ID",
  attendance_silent: "Silent attendance",
};

export const issueLabel = (category: string) => ISSUE_LABELS[category] ?? category.replace(/_/g, " ");

export const employeeDataIssuesApi = {
  list: (opts?: { includeIgnored?: boolean; includeResolved?: boolean }) =>
    api
      .get<{ data: EmployeeDataIssue[] }>("/api/v1/employees/data-issues", {
        params: {
          ...(opts?.includeIgnored ? { include_ignored: 1 } : {}),
          ...(opts?.includeResolved ? { include_resolved: 1 } : {}),
        },
      })
      .then((r) => r.data.data),
  rescan: () => api.post<IssueRescanResult>("/api/v1/employees/data-issues/rescan").then((r) => r.data),
  ignore: (id: number) => api.post(`/api/v1/employees/data-issues/${id}/ignore`),
};
