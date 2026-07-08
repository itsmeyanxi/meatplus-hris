"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { finalPayApi, SEPARATION_TYPES, type FinalPayRecord } from "@/lib/final-pay";

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

function printFinalPay(fp: FinalPayRecord) {
  const empName = fp.employee
    ? `${fp.employee.first_name} ${fp.employee.last_name}`
    : `Employee #${fp.employee_id}`;

  const php = (n: number | string) =>
    "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fmtD = (s: string | null | undefined) => {
    if (!s) return "—";
    return new Date(s + "T00:00:00").toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  };

  const earningRows = fp.earnings_breakdown && fp.earnings_breakdown.length > 0
    ? fp.earnings_breakdown
    : [
        { label: "Unpaid Salary", amount: Number(fp.unpaid_salary) },
        { label: "13th Month Pay", amount: Number(fp.thirteenth_month_pay) },
        ...(Number(fp.leave_conversion) > 0 ? [{ label: "Leave Conversion", amount: Number(fp.leave_conversion) }] : []),
        ...(Number(fp.separation_pay) > 0   ? [{ label: "Separation Pay",   amount: Number(fp.separation_pay) }]   : []),
        ...(Number(fp.other_earnings) > 0   ? [{ label: "Other Earnings",   amount: Number(fp.other_earnings) }]   : []),
      ];

  const deductionRows = fp.deductions_breakdown ?? [];

  const tableRow = (label: string, amount: number, bold = false) =>
    `<tr>
      <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;${bold ? "font-weight:700;" : ""}">${label}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-variant-numeric:tabular-nums;${bold ? "font-weight:700;" : ""}">${php(amount)}</td>
    </tr>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Final Pay — ${empName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #1e293b; padding: 32px 40px; max-width: 720px; margin: 0 auto; }
    h1  { font-size: 18px; font-weight: 700; margin-bottom: 2px; }
    h2  { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: #64748b; margin: 20px 0 6px; }
    .subtitle { font-size: 12px; color: #64748b; margin-bottom: 20px; }
    .header { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin-bottom: 20px; }
    .info-item { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #f1f5f9; font-size: 12px; }
    .info-item .lbl { color: #64748b; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
    table th { background: #f8fafc; padding: 7px 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: #64748b; border-bottom: 2px solid #e2e8f0; }
    table th:last-child { text-align: right; }
    .total-row td { background: #f8fafc; font-weight: 700; border-top: 2px solid #cbd5e1 !important; }
    .net-box { margin-top: 16px; border: 2px solid #0f172a; padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; }
    .net-box .lbl { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
    .net-box .amt { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .sig { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 32px; margin-top: 48px; }
    .sig-item { border-top: 1px solid #0f172a; padding-top: 6px; font-size: 11px; color: #64748b; }
    .sig-item .name { font-weight: 600; color: #1e293b; margin-bottom: 28px; font-size: 12px; }
    .no-ded { color: #94a3b8; font-style: italic; padding: 8px 12px; font-size: 12px; }
    @media print {
      body { padding: 0; }
      @page { margin: 18mm 20mm; size: A4 portrait; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Final Pay Computation</h1>
    <p class="subtitle">
      ${empName} &nbsp;·&nbsp; ${fp.employee?.employee_no ?? ""}
      &nbsp;·&nbsp; ${SEP_LABELS[fp.separation_type] ?? fp.separation_type}
      &nbsp;·&nbsp; Last day: ${fmtD(fp.last_working_day)}
    </p>
  </div>

  <div class="info-grid">
    <div class="info-item"><span class="lbl">Monthly Salary</span><span>${php(fp.basic_monthly)}</span></div>
    <div class="info-item"><span class="lbl">Daily Rate (÷22)</span><span>${php(fp.daily_rate)}</span></div>
    <div class="info-item"><span class="lbl">Prepared by</span><span>${fp.computed_by?.name ?? "HR Officer"}</span></div>
    <div class="info-item"><span class="lbl">Date prepared</span><span>${fmtD(fp.created_at?.split("T")[0])}</span></div>
  </div>

  <h2>Earnings</h2>
  <table>
    <thead><tr><th>Description</th><th>Amount</th></tr></thead>
    <tbody>
      ${earningRows.map((r) => tableRow(r.label, Number(r.amount))).join("")}
      <tr class="total-row">${tableRow("Total Earnings", Number(fp.total_gross), true).replace("<tr>", "").replace("</tr>", "")}</tr>
    </tbody>
  </table>

  <h2 style="margin-top:20px;">Deductions</h2>
  <table>
    <thead><tr><th>Description</th><th>Amount</th></tr></thead>
    <tbody>
      ${deductionRows.length === 0
        ? `<tr><td colspan="2" class="no-ded">No deductions.</td></tr>`
        : deductionRows.map((r) => tableRow(r.label, Number(r.amount))).join("")
      }
      ${Number(fp.total_deductions_amount) > 0
        ? `<tr class="total-row">${tableRow("Total Deductions", Number(fp.total_deductions_amount), true).replace("<tr>", "").replace("</tr>", "")}</tr>`
        : ""
      }
    </tbody>
  </table>

  <div class="net-box">
    <div>
      <div class="lbl">Net Final Pay</div>
      <div style="font-size:11px;color:#64748b;margin-top:2px;">
        Gross ${php(fp.total_gross)} − Deductions ${php(fp.total_deductions_amount)}
      </div>
    </div>
    <div class="amt">${php(fp.net_final_pay)}</div>
  </div>

  <div class="sig">
    <div class="sig-item"><div class="name">${fp.computed_by?.name ?? "HR Officer"}</div>Prepared by</div>
    <div class="sig-item"><div class="name">&nbsp;</div>Reviewed by (HR Manager)</div>
    <div class="sig-item"><div class="name">${empName}</div>Acknowledged by (Employee)</div>
  </div>

  <script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=800,height=900");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

function Row({ label, value, bold, accent, sub }: {
  label: string; value: string; bold?: boolean; accent?: "green" | "red"; sub?: string;
}) {
  return (
    <div className="flex items-start justify-between border-b border-slate-100 px-5 py-2.5 last:border-0">
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
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h4>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
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
            onClick={() => printFinalPay(fp)}
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
      <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 px-5 py-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-800">NET FINAL PAY</p>
            <p className="mt-0.5 text-xs text-emerald-600">
              Gross {php(fp.total_gross)} − Deductions {php(fp.total_deductions_amount)}
            </p>
          </div>
          <p className="text-3xl font-bold text-emerald-700">{php(fp.net_final_pay)}</p>
        </div>
      </div>

    </div>
  );
}
