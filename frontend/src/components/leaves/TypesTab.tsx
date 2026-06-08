"use client";

import { useQuery } from "@tanstack/react-query";
import { TableShell } from "@/components/ui";
import { leaveTypesApi } from "@/lib/leaves";

export function TypesTab() {
  const { data: types = [] } = useQuery({ queryKey: ["leave-types"], queryFn: leaveTypesApi.list });

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">
        {types.length} types seeded. Editing UI ships in Phase 3.1.
      </p>

      <TableShell>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Code</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Name</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Credits/yr</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Paid</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Attachment</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Gender</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Accrual</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Max consecutive</th>
            </tr>
          </thead>
          <tbody>
            {types.map((t) => (
              <tr key={t.id} className="border-t border-slate-100 transition hover:bg-slate-50/70">
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{t.code}</td>
                <td className="px-4 py-3 font-medium text-slate-800">{t.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{t.default_credits_per_year}</td>
                <td className="px-4 py-3 text-slate-600">{t.is_paid ? "Yes" : "No"}</td>
                <td className="px-4 py-3 text-slate-600">{t.requires_attachment ? "Required" : "—"}</td>
                <td className="px-4 py-3 text-slate-600">{t.gender_restriction ?? "any"}</td>
                <td className="px-4 py-3 text-slate-600">{t.accrual_method}</td>
                <td className="px-4 py-3 text-slate-600">{t.max_consecutive_days ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}
