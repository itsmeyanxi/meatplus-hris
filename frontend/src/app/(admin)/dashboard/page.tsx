"use client";

import { useQuery } from "@tanstack/react-query";
import { getMe } from "@/lib/auth";
import { useState } from "react";
import { AppCard } from "@/components/ui";

export default function DashboardPage() {
  const { data } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const [rolesOpen, setRolesOpen] = useState(false);
  const [permissionsOpen, setPermissionsOpen] = useState(false);

  if (!data) return null;
  const { user } = data;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-6 text-white shadow-sm sm:p-8">
        <div className="space-y-8">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:items-start">
            <div className="max-w-2xl space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-300">
                Dashboard overview
              </p>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Welcome, {user.name}
              </h2>
            </div>

            <div className="space-y-5 lg:justify-self-end lg:text-right">
              <p className="max-w-xl text-sm leading-6 text-slate-300 sm:text-base lg:max-w-md lg:text-right">
                Phase 0 foundation is live. Use this view to check your identity, company,
                role access, and permission coverage at a glance.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Roles" value={String(user.roles.length)} tone="light" />
            <StatCard label="Permissions" value={String(user.permissions.length)} tone="light" />
            <StatCard label="Company" value={user.active_company ? "1" : "0"} tone="light" />
            <StatCard
              label="Account"
              value={user.is_active ? "Active" : "Inactive"}
              tone="light"
            />
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-12">
        {/* Adjusted to col-span-6 to maintain dynamic row balance */}
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

        {/* Adjusted to col-span-6 to maintain dynamic row balance */}
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
              /* Only show the button if there are more than 3 roles */
              user.roles.length > 3 && (
                <button
                  type="button"
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                  aria-expanded={rolesOpen}
                  aria-controls="roles-panel"
                  onClick={() => setRolesOpen((open) => !open)}
                >
                  {rolesOpen ? "Collapse" : "Expand"}
                </button>
              )
            }
          />
          
          {/* Show roles if the panel is open OR if there are 3 or fewer roles (no clutter) */}
          {rolesOpen || user.roles.length <= 3 ? (
            user.roles.length === 0 ? (
              <p className="text-sm text-slate-500">No roles assigned.</p>
            ) : (
              <ul id="roles-panel" className="flex flex-wrap gap-2">
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
            /* Only falls back here if there are > 3 roles AND rolesOpen is false */
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
                aria-expanded={permissionsOpen}
                aria-controls="permissions-panel"
                onClick={() => setPermissionsOpen((open) => !open)}
              >
                {permissionsOpen ? "Collapse" : "Expand"}
              </button>
            }
          />

          {permissionsOpen ? (
            <div id="permissions-panel" className="mt-4">
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

function StatCard({
  label,
  value,
  tone = "dark",
}: {
  label: string;
  value: string;
  tone?: "dark" | "light";
}) {
  return (
    <div
      className={
        tone === "light"
          ? "rounded-2xl border border-white/10 bg-white/10 p-3 text-white backdrop-blur"
          : "rounded-2xl border border-slate-200 bg-white p-3"
      }
    >
      <p className={tone === "light" ? "text-xs font-medium text-slate-300" : "text-xs font-medium text-slate-500"}>
        {label}
      </p>
      <p className={tone === "light" ? "mt-2 text-lg font-semibold" : "mt-2 text-lg font-semibold text-slate-900"}>
        {value}
      </p>
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