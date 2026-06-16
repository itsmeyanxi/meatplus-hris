"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { getMe } from "@/lib/auth";
import { HR_ROLES } from "@/components/RoleGate";
import { PageHeader } from "@/components/ui";

const TILES = [
  {
    href: "/attendance/schedules",
    title: "Work schedules",
    desc: "Templates that define daily shifts, rest days, and required hours per day of week.",
    roles: HR_ROLES,
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    href: "/attendance/holidays",
    title: "Holidays",
    desc: "Regular and special holidays. Used by the DTR engine to flag holiday days.",
    roles: HR_ROLES,
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    href: "/attendance/time-logs",
    title: "Time logs",
    desc: "Raw in/out punches (biometric, web, mobile, or manual). Append-only.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l2 2m6-2a8 8 0 11-16 0 8 8 0 0116 0z" />
      </svg>
    ),
  },
  {
    href: "/attendance/dtr",
    title: "Daily time records (DTR)",
    desc: "Computed daily summary: hours worked, late, undertime, OT, rest day, holiday.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-6h13M9 5h11M4 5h.01M4 11h.01M4 17h.01" />
      </svg>
    ),
  },
  {
    href: "/attendance/requests",
    title: "Requests & approvals",
    desc: "File and approve overtime, official business, and attendance corrections.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

export default function AttendanceLandingPage() {
  const { data } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const userRoles = data?.user.roles ?? [];
  const tiles = TILES.filter((t) => !t.roles || t.roles.some((r) => userRoles.includes(r)));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description="Manage work schedules, holidays, time logs, and computed daily time records."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tiles.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="group rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur transition hover:border-slate-300 hover:shadow-md"
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
              {t.icon}
            </div>
            <h3 className="text-base font-semibold text-slate-900">{t.title}</h3>
            <p className="mt-1 text-sm text-slate-500">{t.desc}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition group-hover:text-slate-900">
              Open
              <span aria-hidden>&rarr;</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
