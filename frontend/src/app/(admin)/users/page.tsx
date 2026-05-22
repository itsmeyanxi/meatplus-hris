"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { inputCls } from "@/components/employees/ChildList";
import { ROLE_LABELS, usersApi } from "@/lib/users";

export default function UsersPage() {
  const [q, setQ] = useState("");
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["users", { q }],
    queryFn: () => usersApi.list({ q: q || undefined }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Users</h2>
          <p className="text-sm text-slate-500">
            {isLoading ? "Loading…" : `${items.length} user(s)`}. To give an employee a login, open their profile and click <strong>Provision login</strong>.
          </p>
        </div>
        <Link
          href="/users/new"
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + New direct user
        </Link>
      </div>

      <input
        type="search"
        placeholder="Search by name or email…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className={inputCls}
      />

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Linked employee</th>
              <th className="px-3 py-2">Last login</th>
              <th className="px-3 py-2">Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length === 0 && !isLoading && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">No users match.</td></tr>
            )}
            {items.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-3 py-2 font-medium">
                  <Link href={`/users/${u.id}`} className="hover:underline">{u.name}</Link>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{u.email}</td>
                <td className="px-3 py-2">
                  {u.roles.map((r) => (
                    <span key={r} className="mr-1 rounded-md bg-slate-900 px-2 py-0.5 text-xs font-medium text-white">
                      {ROLE_LABELS[r] ?? r}
                    </span>
                  ))}
                </td>
                <td className="px-3 py-2 text-xs">
                  {u.employee ? <Link href={`/employees/${u.employee.id}`} className="hover:underline"><span className="font-mono text-slate-500">{u.employee.employee_no}</span> {u.employee.full_name}</Link> : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">
                  {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "—"}
                </td>
                <td className="px-3 py-2">
                  <span className={u.is_active ? "rounded-md bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800" : "rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"}>
                    {u.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
