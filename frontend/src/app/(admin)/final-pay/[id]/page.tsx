"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { finalPayApi, SEPARATION_TYPES, type FinalPayRecord } from "@/lib/final-pay";

// ── helpers ───────────────────────────────────────────────────────────────

const php = (n: number | string | null | undefined) =>
  "₱" + Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  return new Date(s + "T00:00:00").toLocaleDateString("en-PH", {
    year: "numeric", month: "short", day: "numeric",
  });
};

const fmtDateLong = (s: string | null | undefined) => {
  if (!s) return "—";
  return new Date(s + "T00:00:00").toLocaleDateString("en-PH", {
    year: "numeric", month: "long", day: "numeric",
  });
};

const SEP_LABELS: Record<string, string> = Object.fromEntries(
  SEPARATION_TYPES.map((t) => [t.value, t.label])
);

// ── print voucher ─────────────────────────────────────────────────────────

function printFinalPay(fp: FinalPayRecord) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const empName = fp.employee
    ? esc(`${fp.employee.first_name} ${fp.employee.last_name}`)
    : `Employee #${fp.employee_id}`;

  const earningRows = fp.earnings_breakdown && fp.earnings_breakdown.length > 0
    ? fp.earnings_breakdown
    : [
        { label: "Unpaid Salary",  amount: Number(fp.unpaid_salary) },
        { label: "13th Month Pay", amount: Number(fp.thirteenth_month_pay) },
        ...(Number(fp.leave_conversion) > 0 ? [{ label: "Leave Conversion", amount: Number(fp.leave_conversion) }] : []),
        ...(Number(fp.separation_pay) > 0   ? [{ label: "Separation Pay",   amount: Number(fp.separation_pay) }]   : []),
        ...(Number(fp.other_earnings) > 0   ? [{ label: "Other Earnings",   amount: Number(fp.other_earnings) }]   : []),
      ];

  const deductionRows = fp.deductions_breakdown ?? [];

  const tdStyle = "padding:7px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;";
  const row = (label: string, amount: number) =>
    `<tr><td style="${tdStyle}">${esc(label)}</td><td style="${tdStyle}text-align:right;font-variant-numeric:tabular-nums;">${php(amount)}</td></tr>`;
  const totalRow = (label: string, amount: number) =>
    `<tr><td style="${tdStyle}font-weight:700;background:#f8fafc;border-top:2px solid #cbd5e1;">${esc(label)}</td><td style="${tdStyle}text-align:right;font-variant-numeric:tabular-nums;font-weight:700;background:#f8fafc;border-top:2px solid #cbd5e1;">${php(amount)}</td></tr>`;

  const createdDate = fp.created_at
    ? new Date(fp.created_at).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })
    : "—";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Final Pay — ${empName}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:13px;color:#1e293b;padding:32px 40px;max-width:720px;margin:0 auto}
    h1{font-size:18px;font-weight:700;margin-bottom:3px}
    h2{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:20px 0 5px}
    .sub{font-size:12px;color:#64748b;margin-bottom:18px}
    .divider{border:0;border-top:2px solid #0f172a;margin-bottom:18px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:3px 24px;margin-bottom:18px}
    .kv{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f1f5f9;font-size:12px}
    .kv .k{color:#64748b}
    table{width:100%;border-collapse:collapse}
    th{background:#f8fafc;padding:7px 14px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#64748b;border-bottom:2px solid #e2e8f0}
    th:last-child{text-align:right}
    .norow td{color:#94a3b8;font-style:italic;padding:8px 14px;font-size:12px}
    .net{margin-top:16px;border:2px solid #0f172a;padding:14px 16px;display:flex;justify-content:space-between;align-items:center}
    .net .nl{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
    .net .na{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums}
    .net .ns{font-size:11px;color:#64748b;margin-top:2px}
    .sig{display:grid;grid-template-columns:1fr 1fr 1fr;gap:32px;margin-top:52px}
    .sig-b{border-top:1px solid #0f172a;padding-top:5px;font-size:11px;color:#64748b}
    .sig-n{font-weight:600;color:#1e293b;margin-bottom:28px;font-size:12px}
    @media print{body{padding:0}@page{margin:18mm 20mm;size:A4 portrait}}
  </style>
</head>
<body>
  <h1>Final Pay Computation</h1>
  <p class="sub">${empName} &nbsp;·&nbsp; ${esc(fp.employee?.employee_no ?? "")} &nbsp;·&nbsp; ${esc(SEP_LABELS[fp.separation_type] ?? fp.separation_type)} &nbsp;·&nbsp; Last day: ${fmtDateLong(fp.last_working_day)}</p>
  <hr class="divider"/>

  <div class="grid">
    <div class="kv"><span class="k">Monthly Salary</span><span>${php(fp.basic_monthly)}</span></div>
    <div class="kv"><span class="k">Daily Rate (÷22)</span><span>${php(fp.daily_rate)}</span></div>
    <div class="kv"><span class="k">Prepared by</span><span>${esc(fp.computed_by?.name ?? "HR Officer")}</span></div>
    <div class="kv"><span class="k">Date prepared</span><span>${createdDate}</span></div>
  </div>

  <h2>Earnings</h2>
  <table>
    <thead><tr><th>Description</th><th>Amount</th></tr></thead>
    <tbody>
      ${earningRows.map((r) => row(r.label ?? "", Number(r.amount))).join("")}
      ${totalRow("Total Earnings", Number(fp.total_gross))}
    </tbody>
  </table>

  <h2>Deductions</h2>
  <table>
    <thead><tr><th>Description</th><th>Amount</th></tr></thead>
    <tbody>
      ${deductionRows.length === 0
        ? `<tr class="norow"><td colspan="2">No deductions.</td></tr>`
        : deductionRows.map((r) => row(r.label ?? "", Number(r.amount))).join("")
      }
      ${Number(fp.total_deductions_amount) > 0 ? totalRow("Total Deductions", Number(fp.total_deductions_amount)) : ""}
    </tbody>
  </table>

  <div class="net">
    <div>
      <div class="nl">Net Final Pay</div>
      <div class="ns">Gross ${php(fp.total_gross)} − Deductions ${php(fp.total_deductions_amount)}</div>
    </div>
    <div class="na">${php(fp.net_final_pay)}</div>
  </div>

  <div class="sig">
    <div class="sig-b"><div class="sig-n">${esc(fp.computed_by?.name ?? "HR Officer")}</div>Prepared by</div>
    <div class="sig-b"><div class="sig-n">&nbsp;</div>Reviewed by (HR Manager)</div>
    <div class="sig-b"><div class="sig-n">${empName}</div>Acknowledged by (Employee)</div>
  </div>

  <script>window.onload=function(){window.print()}<\/script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=800,height=900");
  if (!win) { alert("Print window was blocked. Please allow pop-ups for this site."); return; }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

// ── components ────────────────────────────────────────────────────────────

function Row({ label, value, bold, accent, sub }: {
  label: string; value: string; bold?: boolean; accent?: "green" | "red"; sub?: string;
}) {
  return (
    <div className="flex items-start justify-between border-b border-slate-100 px-5 py-2.5 last:border-0">
      <div>
        <span className="text-sm text-slate-600">{label}</span>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
      <span className={`text-sm tabular-nums shrink-0 ml-4 ${
        accent === "green" ? "font-bold text-emerald-700 text-base"
        : accent === "red"  ? "font-semibold text-red-600"
        : bold              ? "font-semibold text-slate-900"
        :                     "text-slate-700"
      }`}>{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h4>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">{children}</div>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────

export default function FinalPayDetailPage() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();
  const qc      = useQueryClient();

  const { data: fp, isLoading, isError } = useQuery({
    queryKey: ["final-pays", Number(id)],
    queryFn:  () => finalPayApi.get(Number(id)),
  });

  const finalize = useMutation({
    mutationFn: () => finalPayApi.finalize(Number(id)),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["final-pays"] }),
  });

  const cancel = useMutation({
    mutationFn: (reason: string) => finalPayApi.cancel(Number(id), reason),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["final-pays"] }),
  });

  const handleCancel = () => {
    const reason = window.prompt(
      "Reason for cancellation (required):"
    );
    if (reason === null) return;                         // dismissed
    if (reason.trim() === "") {
      alert("Please enter a reason before cancelling.");
      return;
    }
    if (!window.confirm(`Cancel this final pay record?\n\nReason: "${reason.trim()}"\n\nThis action cannot be undone.`)) return;
    cancel.mutate(reason.trim());
  };

  if (isLoading) return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-400">Loading…</div>
  );

  if (isError || !fp) return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
      Failed to load this record. It may not exist or you may not have permission to view it.
    </div>
  );

  const empName     = fp.employee ? `${fp.employee.first_name} ${fp.employee.last_name}` : `Employee #${fp.employee_id}`;
  const isFinalized = fp.status === "finalized";
  const isCancelled = fp.status === "cancelled";
  const basicMonthly = Number(fp.basic_monthly ?? 0);
  const dailyRate    = Number(fp.daily_rate    ?? 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button
            onClick={() => router.back()}
            className="mb-2 flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Final Pay
          </button>
          <h1 className="text-xl font-bold text-slate-900">Final Pay — {empName}</h1>
          <p className="text-sm text-slate-500">
            {SEP_LABELS[fp.separation_type]} · Last day: {fmtDate(fp.last_working_day)}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => printFinalPay(fp)}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            Print / PDF
          </button>

          {!isCancelled && !isFinalized && (
            <button
              onClick={() => { if (window.confirm("Finalize this final pay? This marks it as official.")) finalize.mutate(); }}
              disabled={finalize.isPending}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              Finalize
            </button>
          )}

          {!isCancelled && (
            <button
              onClick={handleCancel}
              disabled={cancel.isPending}
              className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 transition"
            >
              {cancel.isPending ? "Cancelling…" : "Cancel Record"}
            </button>
          )}

          {isFinalized && !isCancelled && (
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
              Finalized
            </span>
          )}
          {isCancelled && (
            <span className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 ring-1 ring-red-200">
              Cancelled
            </span>
          )}
        </div>
      </div>

      {isCancelled && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-3">
          <p className="text-sm font-semibold text-red-700">This record has been cancelled.</p>
          {fp.cancellation_reason && (
            <p className="mt-0.5 text-sm text-red-600">Reason: {fp.cancellation_reason}</p>
          )}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Employee & Basis">
          <Row label="Employee"         value={`${empName}${fp.employee?.employee_no ? ` (${fp.employee.employee_no})` : ""}`} />
          <Row label="Separation Type"  value={SEP_LABELS[fp.separation_type] ?? fp.separation_type} />
          <Row label="Last Working Day" value={fmtDate(fp.last_working_day)} />
          {basicMonthly > 0 && <Row label="Monthly Salary" value={php(basicMonthly)} />}
          {dailyRate    > 0 && <Row label="Daily Rate (÷22)" value={php(dailyRate)} />}
        </Section>

        <Section title="Status & Meta">
          <Row
            label="Status"
            value={isCancelled ? "Cancelled" : isFinalized ? "Finalized" : "Draft"}
            bold
            accent={isCancelled ? "red" : undefined}
          />
          <Row label="Prepared by" value={fp.computed_by?.name ?? "—"} />
          <Row
            label="Prepared on"
            value={fp.created_at
              ? new Date(fp.created_at).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })
              : "—"
            }
          />
          {fp.notes && (
            <div className="border-b border-slate-100 px-5 py-2.5 last:border-0">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes</span>
              <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{fp.notes}</p>
            </div>
          )}
          {fp.cancellation_reason && (
            <div className="border-b border-slate-100 px-5 py-2.5 last:border-0">
              <span className="text-xs font-semibold text-red-500 uppercase tracking-wide">Cancellation Reason</span>
              <p className="mt-1 text-sm text-red-700 whitespace-pre-wrap">{fp.cancellation_reason}</p>
            </div>
          )}
        </Section>
      </div>

      <Section title="Earnings">
        {fp.earnings_breakdown && fp.earnings_breakdown.length > 0
          ? fp.earnings_breakdown.map((row, i) => (
              <Row key={i} label={row.label ?? "—"} value={php(row.amount)} />
            ))
          : <>
              <Row label="Unpaid Salary"  value={php(fp.unpaid_salary)} />
              <Row label="13th Month Pay" value={php(fp.thirteenth_month_pay)} />
              {Number(fp.leave_conversion) > 0 && (
                <Row label="Leave Conversion" value={php(fp.leave_conversion)}
                  sub={`${Number(fp.unused_leave_days ?? 0).toFixed(2)} convertible leave days`} />
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
              <Row key={i} label={row.label ?? "—"} value={php(row.amount)} />
            ))
          : <p className="px-5 py-3 text-sm text-slate-400">No deductions recorded.</p>
        }
        {Number(fp.total_deductions_amount) > 0 && (
          <Row label="Total Deductions" value={php(fp.total_deductions_amount)} accent="red" />
        )}
      </Section>

      {/* Net pay */}
      <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 px-5 py-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-800">NET FINAL PAY</p>
            <p className="mt-0.5 text-xs text-emerald-600">
              Gross {php(fp.total_gross)} − Deductions {php(fp.total_deductions_amount)}
            </p>
          </div>
          <p className="text-3xl font-bold text-emerald-700 tabular-nums">{php(fp.net_final_pay)}</p>
        </div>
      </div>
    </div>
  );
}
