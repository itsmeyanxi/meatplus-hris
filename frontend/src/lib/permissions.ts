import { useQuery } from "@tanstack/react-query";
import { getMe } from "./auth";

/**
 * Hook for role-aware UI. Returns:
 * - canManageAttendance: can file for others + approve/reject any
 * - canApproveOwnDept: dept_head — can approve direct reports / own dept
 * - isLoading: while /me query is in flight
 */
export function useAttendancePerms() {
  const { data, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
  });

  const perms = data?.user.permissions ?? [];

  return {
    isLoading,
    canManageAttendance: perms.includes("attendance.manage"),
    canApproveOwnDept: perms.includes("attendance.approve.self_dept"),
    // Approval is dept_head's (attendance.approve.any), mirroring leaves.
    canApprove:
      perms.includes("attendance.approve.any") ||
      perms.includes("attendance.approve.self_dept"),
  };
}
