"use client";

import { useQuery } from "@tanstack/react-query";
import { leaveTypesApi } from "@/lib/leaves";

export default function LeaveTypesPage() {
  const { data: types = [] } = useQuery({ queryKey: ["leave-types"], queryFn: leaveTypesApi.list });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Leave types</h2>
        <p className="text-sm text-slate-500">{types.length} types seeded. Editing UI ships in Phase 3.1.</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Default credits/yr</th>
              <th className="px-3 py-2">Paid</th>
              <th className="px-3 py-2">Attachment</th>
              <th className="px-3 py-2">Gender</th>
              <th className="px-3 py-2">Accrual</th>
              <th className="px-3 py-2">Max consecutive</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {types.map((t) => (
              <tr key={t.id}>
                <td className="px-3 py-2 font-mono">{t.code}</td>
                <td className="px-3 py-2 font-medium">{t.name}</td>
                <td className="px-3 py-2 font-mono">{t.default_credits_per_year}</td>
                <td className="px-3 py-2">{t.is_paid ? "Yes" : "No"}</td>
                <td className="px-3 py-2">{t.requires_attachment ? "Required" : "—"}</td>
                <td className="px-3 py-2">{t.gender_restriction ?? "any"}</td>
                <td className="px-3 py-2">{t.accrual_method}</td>
                <td className="px-3 py-2">{t.max_consecutive_days ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
