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
  company: string | null;
  is_active: boolean;
};

type TeamData = {
  manager: TeamMember | null;
  reports: TeamMember[];
  peers: TeamMember[];
};

function MemberTable({ rows }: { rows: TeamMember[] }) {
  return (
    <TableShell>
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-slate-50">
          <tr>
            {["Employee", "Company", "Position", "Department", "Status", ""].map((h) => (
              <th key={h} className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((m) => (
            <tr key={m.id} className="hover:bg-slate-50/60">
              <td className="px-4 py-2.5">
                <div className="font-medium text-slate-800">{m.full_name}</div>
                <div className="font-mono text-xs text-slate-400">{m.employee_no}</div>
              </td>
              <td className="px-4 py-2.5">
                {m.company ? (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{m.company}</span>
                ) : "—"}
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
          ))}
        </tbody>
      </table>
    </TableShell>
  );
}

export default function MyTeamPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-team"],
    queryFn: async () => (await api.get<{ data: TeamData }>("/api/v1/my/team")).data.data,
  });

  const manager = data?.manager ?? null;
  const reports = data?.reports ?? [];
  const peers = data?.peers ?? [];
  const isEmpty = !manager && reports.length === 0 && peers.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader title="My Team" description="Your reporting line — who you report to, your teammates, and your direct reports." />

      {isLoading ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-10 text-center text-sm text-slate-400">Loading…</div>
      ) : isEmpty ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-10 text-center text-sm text-slate-500">
          You’re not linked to a reporting line yet — no manager and no direct reports.
        </div>
      ) : (
        <div className="space-y-8">
          {manager && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-800">You report to</h3>
              <Link
                href={`/employees/${manager.id}`}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:bg-slate-50"
              >
                <div>
                  <div className="font-medium text-slate-800">{manager.full_name}</div>
                  <div className="text-xs text-slate-500">
                    {manager.position ?? "—"}
                    {manager.department ? ` · ${manager.department}` : ""}
                  </div>
                </div>
                {manager.company && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{manager.company}</span>
                )}
              </Link>
            </section>
          )}

          {reports.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-800">Your direct reports ({reports.length})</h3>
              <MemberTable rows={reports} />
            </section>
          )}

          {peers.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-800">Your teammates ({peers.length})</h3>
              <MemberTable rows={peers} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
