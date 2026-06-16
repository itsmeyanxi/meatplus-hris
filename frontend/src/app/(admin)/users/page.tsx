"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { AppInput, PageHeader, StatusBadge, TableShell } from "@/components/ui";
import { EmptyState, TableSkeleton } from "@/components/feedback";
import { ROLE_LABELS, usersApi } from "@/lib/users";

export default function UsersPage() {
  const [q, setQ] = useState("");
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["users", { q }],
    queryFn: () => usersApi.list({ q: q || undefined }),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Users"
        description={
          isLoading
            ? "Loading users…"
            : `${items.length} user(s). To give an employee a login, open their profile and click Provision login.`
        }
        actions={
          <Link
            href="/users/new"
            className="inline-flex items-center rounded-xl border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
          >
            + New direct user
          </Link>
        }
      />

      <AppInput
        type="search"
        placeholder="Search by name or email…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <TableShell>
        {isLoading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : items.length === 0 ? (
          <EmptyState
            title="No users found"
            message={q ? "Try a different search term." : "No users yet."}
          />
        ) : (
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
              {items.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium">
                    <Link href={`/users/${u.id}`} className="hover:underline">
                      {u.name}
                    </Link>
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
        )}
      </TableShell>
    </div>
  );
}
