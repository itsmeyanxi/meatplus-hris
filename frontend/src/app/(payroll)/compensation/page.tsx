"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, TableShell } from "@/components/ui";
import { TableSkeleton, EmptyState } from "@/components/feedback";
import { compensationApi, type CompRow } from "@/lib/payroll";

export default function CompensationPage() {
  const qc = useQueryClient();
  const { data: rows, isLoading } = useQuery({ queryKey: ["compensations"], queryFn: compensationApi.list });
  const [edits, setEdits] = useState<Record<number, { basic: string; allowance: string }>>({});

  const save = useMutation({
    mutationFn: (r: CompRow) => {
      const e = edits[r.employee_id];
      return compensationApi.save({
        employee_id: r.employee_id,
        basic_monthly: Number(e?.basic ?? r.basic_monthly ?? 0),
        allowance_monthly: Number(e?.allowance ?? r.allowance_monthly ?? 0),
      });
    },
    onSuccess: () => {
      toast.success("Compensation saved.");
      qc.invalidateQueries({ queryKey: ["compensations"] });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Compensation" description="Set each employee's monthly basic pay and allowance." />

      {isLoading ? (
        <TableShell><TableSkeleton rows={6} cols={4} /></TableShell>
      ) : !rows || rows.length === 0 ? (
        <EmptyState title="No employees" message="Add employees first." />
      ) : (
        <TableShell>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Basic / month</th>
                <th className="px-4 py-3">Allowance / month</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const e = edits[r.employee_id];
                return (
                  <tr key={r.employee_id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-800">{r.name}</div>
                      <div className="font-mono text-xs text-slate-400">{r.employee_no}</div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{r.department ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <input
                        type="number" min={0} step="0.01"
                        className="w-32 rounded-lg border border-slate-200 px-2 py-1 text-sm tabular-nums"
                        value={e?.basic ?? (r.basic_monthly != null ? String(r.basic_monthly) : "")}
                        onChange={(ev) => setEdits({ ...edits, [r.employee_id]: { basic: ev.target.value, allowance: e?.allowance ?? (r.allowance_monthly != null ? String(r.allowance_monthly) : "0") } })}
                        placeholder="0.00"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        type="number" min={0} step="0.01"
                        className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-sm tabular-nums"
                        value={e?.allowance ?? (r.allowance_monthly != null ? String(r.allowance_monthly) : "")}
                        onChange={(ev) => setEdits({ ...edits, [r.employee_id]: { basic: e?.basic ?? (r.basic_monthly != null ? String(r.basic_monthly) : "0"), allowance: ev.target.value } })}
                        placeholder="0.00"
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => save.mutate(r)}
                        disabled={save.isPending}
                        className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
                      >
                        Save
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableShell>
      )}
    </div>
  );
}
