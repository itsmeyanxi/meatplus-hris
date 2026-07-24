"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { getEmployee } from "@/lib/employees";
import { getMe } from "@/lib/auth";

// `sensitive` tabs require employee.view.sensitive (senior HR / IT) — hidden from
// HR Officers and other regular roles.
const TABS: { slug: string; label: string; sensitive?: boolean }[] = [
  { slug: "", label: "Overview" },
  { slug: "attendance", label: "Attendance" },
  { slug: "schedule", label: "Schedule" },
  { slug: "dependents", label: "Dependents" },
  { slug: "emergency-contacts", label: "Emergency contacts" },
  { slug: "education", label: "Education" },
  { slug: "employment-history", label: "Employment history" },
  { slug: "government-ids", label: "Gov't IDs" },
  { slug: "bank-accounts", label: "Bank accounts", sensitive: true },
  { slug: "contracts", label: "Contracts" },
  { slug: "records", label: "201 Records" },
];

export default function EmployeeDetailLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const id = Number(params.id);
  const base = `/employees/${id}`;

  const { data, isLoading } = useQuery({
    queryKey: ["employee", id],
    queryFn: () => getEmployee(id),
    enabled: !!id,
    staleTime: 5 * 60_000,
  });

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const canSensitive = me?.user.permissions.includes("employee.view.sensitive") ?? false;
  const tabs = TABS.filter((t) => !t.sensitive || canSensitive);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/employees" className="text-xs text-slate-500 hover:underline">
            ← Employees
          </Link>
          {isLoading ? (
            <p className="mt-1 text-sm text-slate-500">Loading…</p>
          ) : data ? (
            <>
              <div className="mt-1 text-xs font-mono uppercase tracking-wider text-slate-500">
                {data.employee_no}
              </div>
              <h2 className="text-2xl font-semibold">{data.full_name}</h2>
              <p className="text-sm text-slate-500">
                {data.position?.title} — {data.department?.name}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-red-700">Employee not found.</p>
          )}
        </div>
        {data && (
          <div className="flex items-center gap-2">
            {data.is_confidential && (
              <span className="rounded-md bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800" title="Confidential payroll group — basic pay visible to senior HR / IT only">
                Confidential
              </span>
            )}
            <span
              className={
                data.is_active
                  ? "rounded-md bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800"
                  : "rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
              }
            >
              {data.is_active ? "Active" : "Inactive"}
            </span>
            <Link
              href={`/employees/${id}/edit`}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition"
            >
              Edit
            </Link>
          </div>
        )}
      </div>

      <nav className="flex gap-1 border-b border-slate-200">
        {tabs.map((tab) => {
          const href = tab.slug ? `${base}/${tab.slug}` : base;
          const active = tab.slug
            ? pathname.startsWith(href)
            : pathname === base;
          return (
            <Link
              key={tab.slug}
              href={href}
              className={
                active
                  ? "border-b-2 border-slate-900 px-3 py-2 text-sm font-medium text-slate-900"
                  : "border-b-2 border-transparent px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-900"
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div>{children}</div>
    </div>
  );
}
