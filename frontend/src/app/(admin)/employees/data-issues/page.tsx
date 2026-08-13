"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader, AppButton, TableShell } from "@/components/ui";
import { TableSkeleton, EmptyState } from "@/components/feedback";
import { useConfirm } from "@/components/ConfirmDialog";
import { employeeDataIssuesApi, issueLabel, type EmployeeDataIssue, type Severity } from "@/lib/employee-data-issues";

const QK = ["employee-data-issues"];

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" });
}

const SEV_CLASS: Record<Severity, string> = {
  high: "bg-red-50 text-red-700 ring-red-200",
  medium: "bg-amber-50 text-amber-700 ring-amber-200",
  low: "bg-slate-100 text-slate-600 ring-slate-200",
};

export default function EmployeeDataIssuesPage() {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [category, setCategory] = useState<string | null>(null);

  const { data: rows, isLoading, isError } = useQuery({
    queryKey: QK,
    queryFn: () => employeeDataIssuesApi.list(),
  });

  const rescan = useMutation({
    mutationFn: employeeDataIssuesApi.rescan,
    onSuccess: (r) => {
      toast.success(`Checked. ${r.new} new, ${r.resolved} cleared, ${r.open} open.`);
      qc.invalidateQueries({ queryKey: QK });
    },
  });

  const ignore = useMutation({
    mutationFn: (id: number) => employeeDataIssuesApi.ignore(id),
    meta: { successMessage: "Dismissed." },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });

  // Category summary (counts), and the currently-filtered rows.
  const categories = useMemo(() => {
    const map = new Map<string, number>();
    (rows ?? []).forEach((r) => map.set(r.category, (map.get(r.category) ?? 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const filtered = useMemo(
    () => (rows ?? []).filter((r) => !category || r.category === category),
    [rows, category],
  );

  const highCount = (rows ?? []).filter((r) => r.severity === "high").length;

  const onIgnore = async (a: EmployeeDataIssue) => {
    if (
      await confirm({
        title: "Dismiss this issue?",
        message: `Stop flagging "${issueLabel(a.category)}" for ${a.employee.name}. Use this only when the gap is intentional — it won't reappear.`,
        confirmLabel: "Dismiss",
      })
    ) {
      ignore.mutate(a.id);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Employee data issues"
        description="Records missing payroll or attendance essentials, and employees who've gone silent on the biometric. Fix the record and the issue clears automatically."
        actions={
          <AppButton variant="secondary" onClick={() => rescan.mutate()} disabled={rescan.isPending}>
            {rescan.isPending ? "Checking…" : "Check now"}
          </AppButton>
        }
      />

      {isLoading ? (
        <TableShell><TableSkeleton rows={5} cols={5} /></TableShell>
      ) : isError ? (
        <EmptyState title="Couldn't load issues" message="Please retry in a moment." />
      ) : !rows || rows.length === 0 ? (
        <EmptyState title="All clear" message="No outstanding employee data issues in this company." />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-500">
              {rows.length} open{highCount > 0 && <span className="ml-1 text-red-600">· {highCount} high priority</span>}
            </span>
          </div>

          {/* Category filter chips */}
          <div className="flex flex-wrap gap-2">
            <Chip active={category === null} onClick={() => setCategory(null)}>All ({rows.length})</Chip>
            {categories.map(([cat, n]) => (
              <Chip key={cat} active={category === cat} onClick={() => setCategory(cat)}>
                {issueLabel(cat)} ({n})
              </Chip>
            ))}
          </div>

          <TableShell>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Issue</th>
                  <th className="px-4 py-3">Details</th>
                  <th className="px-4 py-3">Since</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{a.employee.name || "—"}</div>
                      <div className="font-mono text-xs text-slate-400">no {a.employee.employee_no ?? "—"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${SEV_CLASS[a.severity]}`}>
                        {issueLabel(a.category)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{a.detail}</td>
                    <td className="px-4 py-3 text-slate-500">{fmt(a.detected_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        {a.employee.id && (
                          <Link
                            href={`/employees/${a.employee.id}/edit`}
                            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Fix
                          </Link>
                        )}
                        <button
                          type="button"
                          onClick={() => onIgnore(a)}
                          disabled={ignore.isPending}
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Dismiss
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        </>
      )}

      {dialog}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
          : "rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
      }
    >
      {children}
    </button>
  );
}
