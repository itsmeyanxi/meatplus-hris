"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppCard, PageHeader } from "@/components/ui";
import { TableSkeleton } from "@/components/feedback";
import { payrollApi, peso } from "@/lib/payroll";

function fmt(v: string | number | null | undefined): string {
  return Number(v ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

function LineRow({
  label,
  value,
  muted = false,
  bold = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-2.5 last:border-0">
      <span className={`text-sm ${muted ? "text-slate-400" : "text-slate-600"}`}>{label}</span>
      <span
        className={`tabular-nums text-sm ${
          bold ? "font-semibold text-slate-900" : muted ? "text-slate-400" : "text-slate-800"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export default function PayslipDetailPage() {
  const params = useParams();
  const runId = Number(params.id);
  const payslipId = Number(params.payslipId);

  const { data: run, isLoading } = useQuery({
    queryKey: ["payroll-run", runId],
    queryFn: () => payrollApi.getRun(runId),
    enabled: !!runId,
  });

  if (isLoading || !run) {
    return (
      <div className="space-y-4">
        <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
        <div className="h-8 w-64 animate-pulse rounded bg-slate-200" />
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <TableSkeleton rows={7} cols={2} />
        </div>
      </div>
    );
  }

  const slip = run.payslips?.find((s) => s.id === payslipId);

  if (!slip) {
    return (
      <div className="space-y-4">
        <Link href={`/payroll/${runId}`} className="text-sm text-slate-500 hover:text-slate-900">
          ← Back to run
        </Link>
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Payslip not found.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href={`/payroll/${runId}`} className="text-sm text-slate-500 hover:text-slate-900">
        ← Back to run
      </Link>

      <PageHeader
        title={slip.employee.name}
        description={`${slip.employee.employee_no} · ${run.name} · ${run.period_start} → ${run.period_end} · Pay date ${run.pay_date}`}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Earnings */}
        <AppCard title="Earnings">
          <LineRow label="Basic Pay" value={peso(slip.basic_pay)} />
          <LineRow label="Overtime Pay" value={peso(slip.overtime_pay)} />
          {slip.night_diff_pay !== undefined && Number(slip.night_diff_pay) > 0 && (
            <LineRow label="Night Differential" value={peso(slip.night_diff_pay)} />
          )}
          <LineRow label="Allowances" value={peso(slip.allowance)} />
          {Number(slip.daily_allowance ?? 0) > 0 && (
            <LineRow label="Meal Allowance" value={peso(slip.daily_allowance ?? 0)} />
          )}
          {(slip.benefits ?? []).map((b, i) => (
            <LineRow key={i} label={b.label} value={peso(b.amount)} />
          ))}
          <LineRow label="Days Worked" value={`${Number(slip.days_worked)}`} />
          <LineRow label="Gross Pay" value={peso(slip.gross_pay)} bold />
        </AppCard>

        {/* Deductions */}
        <AppCard title="Deductions">
          <LineRow label="SSS (Regular)" value={peso(slip.sss_regular ?? slip.sss)} muted />
          {Number(slip.sss_wisp ?? 0) > 0 && (
            <LineRow label="SSS MPF (WISP)" value={peso(slip.sss_wisp ?? 0)} muted />
          )}
          <LineRow label="PhilHealth" value={peso(slip.philhealth)} muted />
          <LineRow label="Pag-IBIG" value={peso(slip.pagibig)} muted />
          <LineRow label="Withholding Tax" value={peso(slip.withholding_tax)} muted />
          <LineRow label="Absence Deductions" value={peso(slip.absences_deduction)} muted />
          <LineRow label="Tardiness Deductions" value={peso(slip.tardiness_deduction)} muted />
          <LineRow label="Total Deductions" value={peso(slip.total_deductions)} bold />
        </AppCard>
      </div>

      {/* Attendance footnote */}
      {(slip.days_absent > 0 || slip.late_minutes > 0) && (
        <p className="text-xs text-slate-400">
          {slip.days_absent > 0 && `${slip.days_absent} absent day${slip.days_absent !== 1 ? "s" : ""}`}
          {slip.days_absent > 0 && slip.late_minutes > 0 && " · "}
          {slip.late_minutes > 0 && `${slip.late_minutes} late minute${slip.late_minutes !== 1 ? "s" : ""}`}
        </p>
      )}

      {/* Net Pay */}
      <div className="rounded-2xl border border-slate-900 bg-slate-900 p-6 text-white">
        <div className="text-xs font-medium uppercase tracking-widest text-slate-400">Net Pay</div>
        <div className="mt-2 text-4xl font-bold tabular-nums">₱ {fmt(slip.net_pay)}</div>
      </div>
    </div>
  );
}
