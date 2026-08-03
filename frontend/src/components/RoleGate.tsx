"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import type { ReactNode } from "react";
import { getMe } from "@/lib/auth";

/**
 * Client-side role guard. Renders children only if the signed-in user has one
 * of `roles`; otherwise shows an access-denied card. Defense-in-depth only —
 * the backend still enforces its own permission checks.
 */
export function RoleGate({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { data, isLoading } = useQuery({ queryKey: ["me"], queryFn: getMe });

  if (isLoading) {
    return <div className="p-8 text-center text-slate-500">Loading…</div>;
  }

  const userRoles = data?.user.roles ?? [];
  // Admin tiers (super_admin, admin, it_admin) can access every gated page.
  // The backend still enforces the real per-company scoping.
  const isSuperAdmin =
    userRoles.includes("super_admin") || userRoles.includes("admin") || userRoles.includes("it_admin");
  const allowed = isSuperAdmin || roles.some((r) => userRoles.includes(r));

  if (!allowed) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white/90 p-8 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m0-6a9 9 0 110 18 9 9 0 010-18zm0 0V9m-7.071 1.929a10 10 0 0114.142 0" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-slate-900">HR access only</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
          This page is restricted to HR. You don&apos;t have permission to view it.
        </p>
        <Link
          href="/attendance"
          className="mt-6 inline-flex rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
        >
          Back to Attendance
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}

/** Roles that count as "HR" across the app (super-admins are always allowed too). */
export const HR_ROLES = ["hr_admin", "hr_officer"];
