"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui";
import { getRoles, ROLE_LABELS, type Role } from "@/lib/users";

export default function AccessLevelsPage() {
  const { data: roles, isLoading } = useQuery({
    queryKey: ["roles-with-perms"],
    queryFn: getRoles,
    staleTime: 5 * 60_000,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Access Levels"
        description="What each access level (role) can do. Access levels are defined by the system; assign one to a user under Users."
      />

      {isLoading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : !roles || roles.length === 0 ? (
        <p className="text-sm text-slate-400">No access levels found.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {roles.map((r) => (
            <div key={r.name} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-800">
                  {ROLE_LABELS[r.name as Role] ?? r.name}
                </h2>
                <span className="font-mono text-xs text-slate-400">{r.name}</span>
              </div>

              {r.permissions.length === 0 ? (
                <p className="text-xs text-slate-400">No permissions.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {r.permissions.map((p) => (
                    <span key={p} className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600">
                      {p}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
