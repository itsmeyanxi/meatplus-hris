"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { getMe } from "@/lib/auth";
import { AppInput, PageHeader, StatusBadge, TableShell } from "@/components/ui";
import { EmptyState, TableSkeleton } from "@/components/feedback";
import { ROLE_LABELS, usersApi, type UserItem } from "@/lib/users";

export default function UsersPage() {
  const [q, setQ] = useState("");
  const [companyId, setCompanyId] = useState<number | "all">("all");

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  // Companies the admin can filter by (their accessible set).
  const companies = me?.user.companies ?? [];
  const showCompanyControls = companies.length > 1;

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["users", { q, companyId }],
    queryFn: () =>
      usersApi.list({
        q: q || undefined,
        company_id: companyId === "all" ? undefined : companyId,
      }),
    // Keep the online dot roughly live without hammering the API.
    refetchInterval: 60_000,
  });

  // Group by home company. Users with no primary company fall into "Unassigned".
  const groups = useMemo(() => {
    const map = new Map<string, { id: number | null; label: string; code: string | null; rows: UserItem[] }>();
    for (const u of items) {
      const c = u.primary_company ?? null;
      const key = c ? String(c.id) : "none";
      if (!map.has(key)) {
        map.set(key, {
          id: c?.id ?? null,
          label: c?.legal_name ?? "Unassigned",
          code: c?.code ?? null,
          rows: [],
        });
      }
      map.get(key)!.rows.push(u);
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [items]);

  // Group only when spanning multiple companies (i.e. no single-company filter).
  const grouped = companyId === "all" && groups.length > 1;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Users"
        description={
          isLoading
            ? "Loading users…"
            : `${items.length} user(s)${grouped ? ` across ${groups.length} companies` : ""}. To give an employee a login, open their profile and click Provision login.`
        }
        actions={
          <Link
            href="/users/new"
            className="inline-flex items-center rounded-xl border border-slate-900 bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
          >
            + New direct user
          </Link>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <AppInput
          type="search"
          placeholder="Search by name or email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="sm:flex-1"
        />
        {showCompanyControls && (
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
          >
            <option value="all">All companies</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code ? `${c.code} — ` : ""}{c.legal_name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Company quick-filter chips (fast switch when there are several) */}
      {showCompanyControls && (
        <div className="flex flex-wrap gap-1.5">
          <CompanyChip active={companyId === "all"} onClick={() => setCompanyId("all")}>
            All
          </CompanyChip>
          {companies.map((c) => (
            <CompanyChip key={c.id} active={companyId === c.id} onClick={() => setCompanyId(c.id)}>
              {c.code ?? c.legal_name}
            </CompanyChip>
          ))}
        </div>
      )}

      {isLoading ? (
        <TableShell>
          <TableSkeleton rows={6} cols={5} />
        </TableShell>
      ) : items.length === 0 ? (
        <TableShell>
          <EmptyState
            title="No users found"
            message={q ? "Try a different search term." : "No users in this view."}
          />
        </TableShell>
      ) : grouped ? (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.id ?? "none"} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <h2 className="text-sm font-semibold text-slate-700">{g.label}</h2>
                {g.code && (
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">
                    {g.code}
                  </span>
                )}
                <span className="text-xs text-slate-400">{g.rows.length}</span>
              </div>
              <UsersTable rows={g.rows} />
            </section>
          ))}
        </div>
      ) : (
        <UsersTable rows={items} />
      )}
    </div>
  );
}

function CompanyChip({
  active, onClick, children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        active
          ? "border-brand-600 bg-brand-600 text-white shadow-sm"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function UsersTable({ rows }: { rows: UserItem[] }) {
  return (
    <TableShell>
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-3 py-3">Name</th>
            <th className="px-3 py-3">Email</th>
            <th className="px-3 py-3">Role</th>
            <th className="px-3 py-3">Linked employee</th>
            <th className="px-3 py-3">Last login</th>
            <th className="px-3 py-3">Active</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((u) => (
            <tr key={u.id} className="hover:bg-slate-50">
              <td className="px-3 py-2 font-medium">
                <div className="flex items-center gap-2">
                  <span
                    aria-label={u.is_online ? "Online now" : "Offline"}
                    title={
                      u.is_online
                        ? "Online now"
                        : u.last_seen_at
                          ? `Last seen ${new Date(u.last_seen_at).toLocaleString()}`
                          : "Offline"
                    }
                    className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
                      u.is_online ? "bg-emerald-500 ring-2 ring-emerald-200" : "bg-slate-300"
                    }`}
                  />
                  <Link href={`/users/${u.id}`} className="hover:underline">
                    {u.name}
                  </Link>
                </div>
              </td>
              <td className="px-3 py-2 font-mono text-xs">{u.email}</td>
              <td className="px-3 py-2 align-top">
                <div className="flex flex-wrap gap-1.5">
                  {u.roles.map((r) => (
                    <span
                      key={r}
                      className="inline-flex items-center whitespace-nowrap rounded-full border border-slate-200 bg-slate-900 px-2.5 py-1 text-xs font-medium text-white shadow-sm"
                    >
                      {ROLE_LABELS[r] ?? r}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-3 py-2 text-xs">
                {u.employee ? (
                  <Link href={`/employees/${u.employee.id}`} className="hover:underline">
                    <span className="font-mono text-slate-500">{u.employee.employee_no}</span>{" "}
                    {u.employee.full_name}
                  </Link>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className="px-3 py-2 text-xs text-slate-500">
                {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "—"}
              </td>
              <td className="px-3 py-2">
                <StatusBadge active={u.is_active}>{u.is_active ? "Active" : "Inactive"}</StatusBadge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  );
}
