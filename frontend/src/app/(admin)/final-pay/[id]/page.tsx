"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { finalPayApi, SEPARATION_TYPES } from "@/lib/final-pay";

const php = (n: number | string) =>
  "₱ " + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  return new Date(s + "T00:00:00").toLocaleDateString("en-PH", {
    year: "numeric", month: "short", day: "numeric",
  });
};

const SEP_LABELS: Record<string, string> = Object.fromEntries(
  SEPARATION_TYPES.map((t) => [t.value, t.label])
);

function Row({ label, value, bold, accent, sub }: {
  label: string; value: string; bold?: boolean; accent?: "green" | "red"; sub?: string;
}) {
  return (
    <div className="flex items-start justify-between border-b border-slate-100 px-5 py-2.5 last:border-0 print:px-0">
      <div>
        <span className="text-sm text-slate-600">{label}</span>
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
      </div>
      <span className={`text-sm tabular-nums ${
        accent === "green" ? "font-bold text-emerald-700 text-base"
        : accent === "red" ? "font-semibold text-red-600"
        : bold ? "font-semibold text-slate-900" : "text-slate-700"
      }`}>{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 print:text-black">{title}</h4>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white print:border-slate-300">
        {children}
      </div>
    </div>
  );
}

export default function FinalPayDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const qc      = useQueryClient();

  const { data: fp, isLoading } = useQuery({
    queryKey: ["final-pays", Number(id)],
    queryFn:  () => finalPayApi.get(Number(id)),
  });

  const finalize = useMutation({
    mutationFn: () => finalPayApi.finalize(Number(id)),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["final-pays"] }),
  });

  if (isLoading || !fp) return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-400">Loading…</div>
  );

  const empName = fp.employee ? `${fp.employee.first_name} ${fp.employee.last_name}` : `Employee #${fp.employee_id}`;
  const isFinalized = fp.status === "finalized";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between print:hidden">
        <div>
          <button onClick={() => router.back()} className="mb-2 flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            Back to Final Pay
          </button>
          <h1 className="text-xl font-bold text-slate-900">Final Pay — {empName}</h1>
          <p className="text-sm text-slate-500">{SEP_LABELS[fp.separation_type]} · Last day: {fmtDate(fp.last_working_day)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            Print / PDF
          </button>
          {!isFinalized && (
            <button
              onClick={() => { if (window.confirm("Finalize this final pay? This marks it as official.")) finalize.mutate(); }}
              disabled={finalize.isPending}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              Finalize
            </button>
          )}
          {isFinalized && (
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
              Finalized
            </span>
          )}
        </div>
      </div>

      {/* Print header (only visible when printing) */}
      <div className="hidden print:block print:mb-6">
        <p className="text-xl font-bold">Final Pay Computation</p>
        <p className="text-sm text-gray-600">{empName} · {fp.employee?.employee_no}</p>
        <p className="text-sm text-gray-600">
          {SEP_LABELS[fp.separation_type]} · Last working day: {fmtDate(fp.last_working_day)}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Employee & Basis">
          <Row label="Employee"         value={`${empName} (${fp.employee?.employee_no})`} />
          <Row label="Separation Type"  value={SEP_LABELS[fp.separation_type] ?? fp.separation_type} />
          <Row label="Last Working Day" value={fmtDate(fp.last_working_day)} />
          <Row label="Monthly Basic"    value={php(fp.basic_monthly)} />
          <Row label="Daily Rate (÷22)" value={php(fp.daily_rate)} />
          <Row label="Days Worked (Last Period)" value={String(fp.days_worked_last_period)} />
          <Row label="Years of Service" value={`${Number(fp.years_of_service).toFixed(2)} yrs`} />
        </Section>

        <Section title="Status & Meta">
          <Row label="Status"       value={isFinalized ? "Finalized" : "Draft"} bold />
          <Row label="Computed by"  value={fp.computed_by?.name ?? "—"} />
          <Row label="Computed on"  value={new Date(fp.created_at).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })} />
          {fp.notes && <Row label="Notes" value={fp.notes} />}
        </Section>
      </div>

      <Section title="Earnings">
        {fp.earnings_breakdown && fp.earnings_breakdown.length > 0
          ? fp.earnings_breakdown.map((row, i) => (
              <Row key={i} label={row.label} value={php(row.amount)} />
            ))
          : <>
              <Row label="Unpaid Salary" value={php(fp.unpaid_salary)}
                sub={`${fp.days_worked_last_period} days × ${php(fp.daily_rate)}`} />
              <Row label="13th Month Pay" value={php(fp.thirteenth_month_pay)} />
              {Number(fp.leave_conversion) > 0 && (
                <Row label="Leave Conversion" value={php(fp.leave_conversion)}
                  sub={`${Number(fp.unused_leave_days).toFixed(2)} convertible leave days`} />
              )}
              {Number(fp.separation_pay) > 0 && (
                <Row label="Separation Pay" value={php(fp.separation_pay)} />
              )}
              {Number(fp.other_earnings) > 0 && (
                <Row label="Other Earnings" value={php(fp.other_earnings)} />
              )}
            </>
        }
        <Row label="Total Earnings" value={php(fp.total_gross)} bold />
      </Section>

      <Section title="Deductions">
        {fp.deductions_breakdown && fp.deductions_breakdown.length > 0
          ? fp.deductions_breakdown.map((row, i) => (
              <Row key={i} label={row.label} value={php(row.amount)} />
            ))
          : <p className="px-5 py-3 text-sm text-slate-400">No deductions recorded.</p>
        }
        {Number(fp.total_deductions_amount) > 0 && (
          <Row label="Total Deductions" value={php(fp.total_deductions_amount)} accent="red" />
        )}
      </Section>

      {/* Net pay highlight */}
      <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 px-5 py-5 print:border-black print:bg-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-800 print:text-black">NET FINAL PAY</p>
            <p className="mt-0.5 text-xs text-emerald-600 print:text-gray-500">
              Gross {php(fp.total_gross)} − Deductions {php(fp.total_deductions_amount)}
            </p>
          </div>
          <p className="text-3xl font-bold text-emerald-700 print:text-black">{php(fp.net_final_pay)}</p>
        </div>
      </div>

      {/* Print footer */}
      <div className="hidden print:block print:mt-10 print:border-t print:pt-6">
        <div className="grid grid-cols-3 gap-8 text-sm">
          <div>
            <p className="font-semibold">Prepared by:</p>
            <div className="mt-8 border-t border-black" />
            <p className="mt-1 text-xs text-gray-500">{fp.computed_by?.name ?? "HR Officer"}</p>
          </div>
          <div>
            <p className="font-semibold">Reviewed by:</p>
            <div className="mt-8 border-t border-black" />
            <p className="mt-1 text-xs text-gray-500">HR Manager</p>
          </div>
          <div>
            <p className="font-semibold">Acknowledged by:</p>
            <div className="mt-8 border-t border-black" />
            <p className="mt-1 text-xs text-gray-500">Employee</p>
          </div>
        </div>
      </div>
    </div>
  );
}
