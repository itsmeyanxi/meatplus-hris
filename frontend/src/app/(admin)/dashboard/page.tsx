"use client";

import { useQuery } from "@tanstack/react-query";
import { getMe } from "@/lib/auth";

export default function DashboardPage() {
  const { data } = useQuery({ queryKey: ["me"], queryFn: getMe });

  if (!data) return null;
  const { user } = data;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Welcome, {user.name}</h2>
        <p className="text-sm text-slate-500">
          Phase 0 foundation. Phase 1 (201 file) is up next.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Account">
          <Row label="Email" value={user.email} />
          <Row label="Active" value={user.is_active ? "Yes" : "No"} />
          <Row
            label="Last login"
            value={user.last_login_at ? new Date(user.last_login_at).toLocaleString() : "—"}
          />
        </Card>

        <Card title="Active company">
          {user.active_company ? (
            <>
              <Row label="Code" value={user.active_company.code} />
              <Row label="Legal name" value={user.active_company.legal_name} />
            </>
          ) : (
            <p className="text-sm text-slate-500">No company selected.</p>
          )}
        </Card>

        <Card title={`Roles (${user.roles.length})`}>
          {user.roles.length === 0 ? (
            <p className="text-sm text-slate-500">No roles assigned.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {user.roles.map((r) => (
                <li
                  key={r}
                  className="rounded-md bg-slate-900 px-2 py-0.5 text-xs font-medium text-white"
                >
                  {r}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={`Permissions (${user.permissions.length})`}>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-700">
            {user.permissions.map((p) => (
              <li key={p} className="font-mono">
                {p}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-slate-100 py-1.5 text-sm last:border-b-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
