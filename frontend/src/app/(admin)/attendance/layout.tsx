"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getMe } from "@/lib/auth";
import { type ReactNode } from "react";

type Tab = {
  href: string;
  label: string;
  exact?: boolean;
  permissions?: string[];
  roles?: string[];
};

const TABS: Tab[] = [
  { href: "/attendance/dtr",       label: "Matrix" },
  { href: "/attendance/time-logs", label: "Time Logs" },
  { href: "/attendance/requests",  label: "Requests" },
  { href: "/attendance/uploads",   label: "Uploads",   permissions: ["attendance.manage", "attendance.approve.any"] },
  { href: "/attendance/schedules", label: "Schedules", permissions: ["attendance.manage"] },
  { href: "/attendance/holidays",  label: "Holidays",  permissions: ["attendance.manage"] },
];

export default function AttendanceLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const perms = me?.user.permissions ?? [];
  const roles = me?.user.roles ?? [];
  const isSuperAdmin = roles.includes("it_admin") || roles.includes("admin");

  const visible = TABS.filter((t) => {
    if (isSuperAdmin) return true;
    const permOk = !t.permissions || t.permissions.some((p) => perms.includes(p));
    const roleOk = !t.roles || t.roles.some((r) => roles.includes(r));
    return permOk && roleOk;
  });

  // Match the deepest tab whose href is a prefix of the current path
  const active = visible
    .slice()
    .reverse()
    .find((t) => pathname === t.href || pathname.startsWith(t.href + "/"));

  return (
    <div className="space-y-5">
      {/* Sub-nav tab bar */}
      <div className="flex items-center gap-1 border-b border-slate-200 -mb-1">
        {visible.map((t) => {
          const isActive = active?.href === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={
                isActive
                  ? "-mb-px border-b-2 border-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-900"
                  : "-mb-px border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-slate-500 transition hover:text-slate-800"
              }
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
