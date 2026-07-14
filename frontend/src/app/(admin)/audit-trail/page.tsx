"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader, TableShell } from "@/components/ui";

type AuditEntry = {
  id: number;
  log_name: string | null;
  event: string | null;
  subject_type: string | null;
  subject_id: number | null;
  causer: string;
  created_at: string;
};

export default function AuditTrailPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["audit-trail"],
    queryFn: async () => (await api.get<{ data: AuditEntry[] }>("/api/v1/audit-trail")).data.data,
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Audit Trail" description="Recent changes to employees, users and compensation (most recent first)." />
      <TableShell>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50">
              <tr>
                {["When", "Who", "Action", "Area", "Record"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {isLoading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-400">Loading…</td></tr>
              ) : (data?.length ?? 0) === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-400">No activity logged yet. Changes from now on will appear here.</td></tr>
              ) : (
                data!.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/60">
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{new Date(a.created_at).toLocaleString()}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{a.causer}</td>
                    <td className="px-4 py-2.5">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-600">{a.event ?? "—"}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 capitalize">{a.log_name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-500">{a.subject_type ? `${a.subject_type} #${a.subject_id}` : "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </TableShell>
    </div>
  );
}
