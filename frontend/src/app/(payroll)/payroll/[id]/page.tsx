"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageHeader, AppButton, TableShell } from "@/components/ui";
import { TableSkeleton } from "@/components/feedback";
import { useConfirm } from "@/components/ConfirmDialog";
import { payrollApi, peso, bankFileUrl, type RunStatus } from "@/lib/payroll";
import { downloadPayrollReport } from "@/lib/reports";
import { RunAdjustments } from "@/components/payroll/RunAdjustments";

const STATUS_STYLES: Record<RunStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  computed: "bg-sky-50 text-sky-700",
  approved: "bg-amber-50 text-amber-700",
  posted: "bg-emerald-50 text-emerald-700",
};

export default function PayrollRunPage() {
  const params = useParams();
  const id = Number(params.id);
  const router = useRouter();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [isExporting, setIsExporting] = useState(false);

  const { data: run, isLoading } = useQuery({
    queryKey: ["payroll-run", id],
    queryFn: () => payrollApi.getRun(id),
    enabled: !!id,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["payroll-run", id] });
    qc.invalidateQueries({ queryKey: ["payroll-runs"] });
  };

  const compute = useMutation({
    mutationFn: () => payrollApi.compute(id),
    onSuccess: (res) => { toast.success(`Computed ${res?.summary?.employees ?? 0} payslip(s).`); refresh(); },
  });
  const approve = useMutation({ mutationFn: () => payrollApi.approve(id), onSuccess: () => { toast.success("Run approved."); refresh(); } });
  const post = useMutation({ mutationFn: () => payrollApi.post(id), onSuccess: () => { toast.success("Run posted."); refresh(); } });
  const del = useMutation({
    mutationFn: () => payrollApi.deleteRun(id),
    onSuccess: () => { toast.success("Run deleted."); qc.invalidateQueries({ queryKey: ["payroll-runs"] }); router.push("/payroll"); },
  });

  const handleExport = async () => {
    if (!run) return;
    setIsExporting(true);
    try {
      await downloadPayrollReport(id, run.name);
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading || !run) return <div className="space-y-4"><TableShell><TableSkeleton rows={6} cols={7} /></TableShell></div>;

  const slips = run.payslips ?? [];
  const totals = slips.reduce(
    (a, s) => ({ gross: a.gross + Number(s.gross_pay), ded: a.ded + Number(s.total_deductions), net: a.net + Number(s.net_pay) }),
    { gross: 0, ded: 0, net: 0 },
  );
  const busy = compute.isPending || approve.isPending || post.isPending || del.isPending;

  return (
    <div className="space-y-6">
      {dialog}
      <Link href="/payroll" className="text-sm text-slate-500 hover:text-slate-900">← Back to payroll</Link>

      <PageHeader
        title={run.name}
        description={`${run.period_start} → ${run.period_end} · Pay date ${run.pay_date}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${STATUS_STYLES[run.status]}`}>{run.status}</span>
            {slips.length > 0 && (
              <AppButton variant="secondary" onClick={handleExport} disabled={isExporting || busy}>
                {isExporting ? "Exporting…" : "Export CSV"}
              </AppButton>
            )}
            {slips.length > 0 && (
              <a
                href={bankFileUrl(id)}
                className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                title="Download the bank disbursement file (account no. + net pay)"
              >
                Bank file
              </a>
            )}
            {(run.status === "draft" || run.status === "computed") && (
              <AppButton
                onClick={() => {
                  if (window.confirm("Re-computing will overwrite all existing payslips for this run. Continue?")) {
                    compute.mutate();
                  }
                }}
                disabled={busy}
              >
                {compute.isPending ? "Computing…" : "Compute"}
              </AppButton>
            )}
            {run.status === "computed" && (
              <AppButton onClick={() => approve.mutate()} disabled={busy}>Approve</AppButton>
            )}
            {run.status === "approved" && (
              <AppButton onClick={() => post.mutate()} disabled={busy}>Post</AppButton>
            )}
            {run.status !== "posted" && (
              <AppButton
                variant="secondary"
                disabled={busy}
                onClick={async () => {
                  if (await confirm({ title: "Delete run?", message: `${run.name} and its payslips will be removed.`, confirmLabel: "Delete", danger: true })) del.mutate();
                }}
              >
                Delete
              </AppButton>
            )}
          </div>
        }
      />

      <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
        <StatusStepper status={run.status} />
        <p className="mt-3 text-xs text-slate-500">{NEXT_HINT[run.status]}</p>
      </div>

      {slips.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Summary label="Gross" value={peso(totals.gross)} />
          <Summary label="Deductions" value={peso(totals.ded)} />
          <Summary label="Net pay" value={peso(totals.net)} highlight />
        </div>
      )}

      <RunAdjustments runId={id} editable={run.status === "draft" || run.status === "computed"} onChanged={refresh} />

      {slips.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No payslips yet. Press <strong>Compute</strong> to generate them from compensation + attendance.
        </div>
      ) : (
        <TableShell>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-3">Employee</th>
                  <th className="px-3 py-3 text-right">Days</th>
                  <th className="px-3 py-3 text-right">De Minimis</th>
                  <th className="px-3 py-3 text-right">Gross</th>
                  <th className="px-3 py-3 text-right">SSS</th>
                  <th className="px-3 py-3 text-right">PhilHealth</th>
                  <th className="px-3 py-3 text-right">Pag-IBIG</th>
                  <th className="px-3 py-3 text-right">Tax</th>
                  <th className="px-3 py-3 text-right">Loans</th>
                  <th className="px-3 py-3 text-right">Deductions</th>
                  <th className="px-3 py-3 text-right">Net pay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {slips.map((s) => (
                  <tr
                    key={s.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => router.push(`/payroll/${id}/payslips/${s.id}`)}
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-slate-800">{s.employee.name}</div>
                      <div className="font-mono text-xs text-slate-400">{s.employee.employee_no}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{Number(s.days_worked)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{peso(s.de_minimis ?? 0)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{peso(s.gross_pay)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{peso(s.sss)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{peso(s.philhealth)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{peso(s.pagibig)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{peso(s.withholding_tax)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{peso(s.loans_deduction ?? 0)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{peso(s.total_deductions)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-slate-900">{peso(s.net_pay)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TableShell>
      )}
    </div>
  );
}

const STAGES: RunStatus[] = ["draft", "computed", "approved", "posted"];
const STAGE_LABEL: Record<RunStatus, string> = { draft: "Draft", computed: "Computed", approved: "Approved", posted: "Posted" };
const NEXT_HINT: Record<RunStatus, string> = {
  draft: "Next: press Compute to generate payslips from compensation + attendance.",
  computed: "Payslips are ready. Review them below, then Approve when correct.",
  approved: "Approved and locked for posting. Press Post to finalize this payroll.",
  posted: "This run is posted and final. Payslips can be exported and viewed.",
};

function StatusStepper({ status }: { status: RunStatus }) {
  const idx = STAGES.indexOf(status);
  return (
    <ol className="flex flex-wrap items-center gap-y-2">
      {STAGES.map((st, i) => {
        const done = i < idx;
        const current = i === idx;
        return (
          <li key={st} className="flex items-center">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                done ? "bg-emerald-500 text-white" : current ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-400"
              }`}
            >
              {done ? "✓" : i + 1}
            </span>
            <span className={`ml-2 text-sm font-medium ${current ? "text-slate-900" : done ? "text-emerald-600" : "text-slate-400"}`}>
              {STAGE_LABEL[st]}
            </span>
            {i < STAGES.length - 1 && <span className={`mx-3 h-px w-8 sm:w-12 ${done ? "bg-emerald-400" : "bg-slate-200"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

function Summary({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white"}`}>
      <div className={`text-xs font-medium uppercase tracking-wide ${highlight ? "text-slate-300" : "text-slate-500"}`}>{label}</div>
      <div className="mt-1 text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}
