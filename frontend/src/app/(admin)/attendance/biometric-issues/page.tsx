"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader, AppButton, TableShell } from "@/components/ui";
import { TableSkeleton, EmptyState } from "@/components/feedback";
import { useConfirm } from "@/components/ConfirmDialog";
import { biometricAnomaliesApi, type BiometricAnomaly } from "@/lib/biometric-anomalies";

const QK = ["biometric-anomalies"];

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric" });
}

export default function BiometricIssuesPage() {
  // useSearchParams (for the ?focus deep-link) must sit under a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <BiometricIssuesContent />
    </Suspense>
  );
}

function BiometricIssuesContent() {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [includeResolved, setIncludeResolved] = useState(false);

  // A notification deep-links here with ?focus=<id> — scroll to and highlight that row.
  // (Cross-company switching is handled centrally by the attendance layout's gate.)
  const focusId = Number(useSearchParams().get("focus")) || null;

  const { data: rows, isLoading, isError } = useQuery({
    queryKey: [...QK, includeResolved],
    queryFn: () => biometricAnomaliesApi.list(includeResolved),
  });

  useEffect(() => {
    if (!focusId || !rows) return;
    const el = document.getElementById(`bio-row-${focusId}`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusId, rows]);

  const rescan = useMutation({
    mutationFn: biometricAnomaliesApi.rescan,
    onSuccess: (r) => {
      toast.success(`Checked. ${r.new} new, ${r.ongoing} ongoing, ${r.resolved} cleared.`);
      qc.invalidateQueries({ queryKey: QK });
    },
  });

  const resolve = useMutation({
    mutationFn: (id: number) => biometricAnomaliesApi.resolve(id),
    meta: { successMessage: "Marked resolved." },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });

  const onResolve = async (a: BiometricAnomaly) => {
    if (
      await confirm({
        title: "Mark this resolved?",
        message: `Confirm you've fixed the mapping for ${a.employee.name} (PIN ${a.pin}). It will reappear if the collision is still detected on the next daily scan.`,
        confirmLabel: "Mark resolved",
      })
    ) {
      resolve.mutate(a.id);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Biometric mapping issues"
        description="Punches landing on the wrong employee because a device PIN was reused for a different person. Fix the person's biometric ID (or add the real owner), then mark it resolved."
        actions={
          <AppButton variant="secondary" onClick={() => rescan.mutate()} disabled={rescan.isPending}>
            {rescan.isPending ? "Checking…" : "Check now"}
          </AppButton>
        }
      />

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={includeResolved} onChange={(e) => setIncludeResolved(e.target.checked)} />
        Show resolved
      </label>

      {isLoading ? (
        <TableShell><TableSkeleton rows={3} cols={6} /></TableShell>
      ) : isError ? (
        <EmptyState title="Couldn't load issues" message="Please retry in a moment." />
      ) : !rows || rows.length === 0 ? (
        <EmptyState
          title="No mapping issues"
          message="Every device PIN currently resolves to the right person. New collisions will show up here and on the HR notification bell."
        />
      ) : (
        <TableShell>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Employee receiving the punches</th>
                <th className="px-4 py-3">Device PIN</th>
                <th className="px-4 py-3">Device says it's</th>
                <th className="px-4 py-3 text-right">Punches</th>
                <th className="px-4 py-3">Detected</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((a) => (
                <tr
                  key={a.id}
                  id={`bio-row-${a.id}`}
                  className={`hover:bg-slate-50/60 ${a.resolved_at ? "opacity-50" : ""} ${
                    focusId === a.id ? "bg-amber-50 ring-2 ring-inset ring-amber-300" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{a.employee.name || "—"}</div>
                    <div className="font-mono text-xs text-slate-400">
                      no {a.employee.employee_no ?? "—"} · bio {a.employee.biometric_user_id ?? "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-600">{a.pin}</td>
                  <td className="px-4 py-3 text-slate-700">{a.device_name ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">{a.punches}</td>
                  <td className="px-4 py-3 text-slate-500">{fmt(a.detected_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      {a.employee.id && (
                        <Link
                          href={`/employees/${a.employee.id}/edit`}
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Fix biometric ID
                        </Link>
                      )}
                      {a.resolved_at ? (
                        <span className="px-2.5 py-1.5 text-xs text-slate-400">Resolved {fmt(a.resolved_at)}</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onResolve(a)}
                          disabled={resolve.isPending}
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Mark resolved
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      )}

      {dialog}
    </div>
  );
}
