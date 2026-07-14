"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { PageHeader, TableShell } from "@/components/ui";

type TeamMember = {
  id: number;
  employee_no: string;
  full_name: string;
  position: string | null;
  department: string | null;
  is_active: boolean;
};

export default function MyTeamPage() {
  const { data: team, isLoading } = useQuery({
    queryKey: ["my-team"],
    queryFn: async () => (await api.get<{ data: TeamMember[] }>("/api/v1/my/team")).data.data,
  });

  return (
    <div className="space-y-6">
      <PageHeader title="My Team" description="Your direct reports — the people who report to you." />

      <TableShell>
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50">
            <tr>
              {["Employee", "Position", "Department", "Status", ""].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {isLoading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-400">Loading…</td></tr>
            ) : (team?.length ?? 0) === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-400">No one reports to you yet.</td></tr>
            ) : (
              team!.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-800">{m.full_name}</div>
                    <div className="font-mono text-xs text-slate-400">{m.employee_no}</div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{m.position ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-600">{m.department ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    {m.is_active ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Active</span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">Inactive</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link href={`/employees/${m.id}`} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-900">
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}
