"use client";

import { useQuery } from "@tanstack/react-query";
import { getMe } from "@/lib/auth";
import { useState } from "react";
import { AppCard, PageHeader } from "@/components/ui";

export default function AccountPage() {
  const { data: meData, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
  });

  const [rolesOpen, setRolesOpen] = useState(false);
  const [permissionsOpen, setPermissionsOpen] = useState(false);

  if (isLoading || !meData) {
    return <div className="p-8 text-center text-slate-500">Loading account...</div>;
  }

  const { user } = meData;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Account"
        description="Your account details, company selection, roles, and permissions."
      />

      <div className="grid gap-4 lg:grid-cols-12">
        <AppCard title="Account" className="lg:col-span-6">
          <div className="space-y-3">
            <Row label="Email" value={user.email} />
            <Row label="Status" value={user.is_active ? "Active" : "Inactive"} />
            <Row
              label="Last login"
              value={user.last_login_at ? new Date(user.last_login_at).toLocaleString() : "—"}
            />
          </div>
        </AppCard>

        <AppCard title="Company" className="lg:col-span-6">
          {user.active_company ? (
            <div className="space-y-3">
              <Row label="Code" value={user.active_company.code} />
              <Row label="Legal name" value={user.active_company.legal_name} />
              <Row label="Selection" value="Active company" />
            </div>
          ) : (
            <p className="text-sm text-slate-500">No company selected.</p>
          )}
        </AppCard>

        <AppCard title={`Roles (${user.roles.length})`} className="lg:col-span-5">
          <SectionHeader
            title="Role access"
            subtitle="Primary access groups assigned to the current user"
            action={
              user.roles.length > 3 && (
                <button
                  type="button"
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                  onClick={() => setRolesOpen((open) => !open)}
                >
                  {rolesOpen ? "Collapse" : "Expand"}
                </button>
              )
            }
          />

          {rolesOpen || user.roles.length <= 3 ? (
            user.roles.length === 0 ? (
              <p className="text-sm text-slate-500">No roles assigned.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {user.roles.map((r) => (
                  <li
                    key={r}
                    className="rounded-full border border-slate-200 bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm"
                  >
                    {r}
                  </li>
                ))}
              </ul>
            )
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-sm text-slate-500">
              Role detail is collapsed. Expand it to inspect assigned access groups.
            </div>
          )}
        </AppCard>

        <AppCard title={`Permissions (${user.permissions.length})`} className="lg:col-span-7">
          <SectionHeader
            title="Permission detail"
            subtitle="Expanded permission list can be collapsed when you only need the summary"
            action={
              <button
                type="button"
                className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                onClick={() => setPermissionsOpen((open) => !open)}
              >
                {permissionsOpen ? "Collapse" : "Expand"}
              </button>
            }
          />

          {permissionsOpen ? (
            <div className="mt-4">
              {user.permissions.length === 0 ? (
                <p className="text-sm text-slate-500">No permissions assigned.</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {user.permissions.map((p) => (
                    <li
                      key={p}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-700"
                    >
                      {p}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-sm text-slate-500">
              Permission detail is collapsed. Expand it to inspect the full list.
            </div>
          )}
        </AppCard>
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2 text-sm last:border-b-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-900">{value}</span>
    </div>
  );
}
