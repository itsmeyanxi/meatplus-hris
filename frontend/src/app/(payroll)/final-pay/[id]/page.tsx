"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { finalPayApi, SEPARATION_TYPES, type FinalPayRecord, type PayrollHistory } from "@/lib/final-pay";

// ── helpers ───────────────────────────────────────────────────────────────

const phpFmt = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const php = (n: number | string | null | undefined) => "₱" + phpFmt(n);

const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  return new Date(s + "T00:00:00").toLocaleDateString("en-PH", {
    year: "numeric", month: "short", day: "numeric",
  });
};

const SEP_LABELS: Record<string, string> = Object.fromEntries(
  SEPARATION_TYPES.map((t) => [t.value, t.label])
);

const initials = (name: string) =>
  name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

// ── predefined row structure (for print layout matching reference) ─────────

const PRINT_EARNINGS_DEF = [
  { key: "basic",           label: "Basic",                     sub: false },
  { key: "de_minimis",      label: "De Minimis",                sub: false },
  { key: "13th_month",      label: "13th Month",                sub: false },
  { key: "overtime",        label: "Overtime",                  sub: true  },
  { key: "legal_hol",       label: "Legal Holiday",             sub: true  },
  { key: "special_hol",     label: "Special Holiday",           sub: true  },
  { key: "rest_day",        label: "Rest Day",                  sub: true  },
  { key: "legal_hol_rest",  label: "Legal Holiday Rest Day",    sub: true  },
  { key: "spec_hol_rest",   label: "Special Holiday Rest Day",  sub: true  },
  { key: "double_hol",      label: "Double Holiday",            sub: true  },
  { key: "monetized_leave", label: "Monetized Leave",           sub: false },
];

const PRINT_DEDUCTIONS_DEF = [
  { key: "absence_basic", label: "Absences/Tardiness (Basic)" },
  { key: "absence_dmis",  label: "Absences (DMis)"           },
  { key: "sss_loan",      label: "SSS Loan"                  },
  { key: "hdmf_loan",     label: "HDMF Loan"                 },
  { key: "sss",           label: "SSS"                       },
  { key: "philhealth",    label: "Philhealth"                 },
  { key: "hdmf",          label: "HDMF"                      },
  { key: "tax_payable",   label: "Tax Payable (Refund)"       },
];

// ── print voucher ─────────────────────────────────────────────────────────

// BIR TRAIN Law (2023+) annual income tax
function trainTax(annualTaxable: number): number {
  if (annualTaxable <= 250_000) return 0;
  if (annualTaxable <= 400_000) return (annualTaxable - 250_000) * 0.15;
  if (annualTaxable <= 800_000) return 22_500 + (annualTaxable - 400_000) * 0.20;
  if (annualTaxable <= 2_000_000) return 102_500 + (annualTaxable - 800_000) * 0.25;
  if (annualTaxable <= 8_000_000) return 402_500 + (annualTaxable - 2_000_000) * 0.30;
  return 2_202_500 + (annualTaxable - 8_000_000) * 0.35;
}

function printFinalPay(fp: FinalPayRecord, history?: PayrollHistory) {
  const esc = (s: unknown) =>
    String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const f2 = (n: unknown) =>
    Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dash = (n: unknown) => (Number(n ?? 0) > 0 ? f2(n) : "&ndash;");

  const empName = fp.employee
    ? `${fp.employee.first_name} ${fp.employee.last_name}`
    : `Employee #${fp.employee_id}`;

  const cutoffMatch = fp.notes?.match(/Payroll cut-off: (.+)/);
  const cutoffDate  = cutoffMatch ? cutoffMatch[1] : "—";

  const createdDate = fp.created_at
    ? new Date(fp.created_at).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })
    : "—";

  const endDateLong = fp.last_working_day
    ? new Date(fp.last_working_day + "T00:00:00").toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })
    : "—";

  // Map stored breakdown to predefined rows
  const byEarn = new Map(
    (fp.earnings_breakdown ?? []).map((r) => [(r.label ?? "").toLowerCase().trim(), Number(r.amount ?? 0)])
  );
  const byDed = new Map(
    (fp.deductions_breakdown ?? []).map((r) => [(r.label ?? "").toLowerCase().trim(), Number(r.amount ?? 0)])
  );

  const earnRows = PRINT_EARNINGS_DEF.map((d) => ({
    ...d, amount: byEarn.get(d.label.toLowerCase()) ?? 0,
  }));
  const dedRows = PRINT_DEDUCTIONS_DEF.map((d) => ({
    ...d, amount: byDed.get(d.label.toLowerCase()) ?? 0,
  }));

  // Any breakdown rows not in predefined list (old-format records)
  const knownEarnLabels = new Set(PRINT_EARNINGS_DEF.map((d) => d.label.toLowerCase()));
  const knownDedLabels  = new Set(PRINT_DEDUCTIONS_DEF.map((d) => d.label.toLowerCase()));
  const extraEarns = (fp.earnings_breakdown ?? []).filter(
    (r) => !knownEarnLabels.has((r.label ?? "").toLowerCase().trim()) && Number(r.amount) > 0
  );
  const extraDeds = (fp.deductions_breakdown ?? []).filter(
    (r) => !knownDedLabels.has((r.label ?? "").toLowerCase().trim()) && Number(r.amount) > 0
  );

  const totalGross = Number(fp.total_gross ?? 0);
  const totalDed   = Number(fp.total_deductions_amount ?? 0);
  const netPay     = Number(fp.net_final_pay ?? 0);

  // Part III — annual tax computation using payroll history
  const deMinisFp  = earnRows.find((r) => r.key === "de_minimis")?.amount ?? 0;
  const taxPayable = dedRows.find((r) => r.key === "tax_payable")?.amount ?? 0;

  const hist = history;
  const annualBasic   = hist?.totals.basic_salary     ?? 0;
  const annualOther   = hist?.totals.other_earnings   ?? 0;
  const annualGovDed  = hist?.totals.sss_phc_hdmf     ?? 0;
  const annualWithheld = hist?.totals.withheld         ?? 0;
  const earningsToReceive = totalGross;

  // Annual total income (A.1) = historical basic + other earnings + final pay gross
  const annualEarnings = annualBasic + annualOther;
  // Total SSS/PHC/HDMF for the year (from payroll history; final pay's gov deductions already included in annualGovDed if payroll ran for that period)
  const totalGovDed    = annualGovDed;
  // Total de minimis (from final pay breakdown only — payslips don't track it separately)
  const totalDeMinis   = deMinisFp;
  // Gross taxable = (A.1 + earnings to receive) - gov deductions - de minimis
  const grossTaxable   = Math.max(0, annualEarnings + earningsToReceive - totalGovDed - totalDeMinis);
  const taxDue         = trainTax(grossTaxable);
  // Withholding from Present Employer (A.2) = annual withheld from payroll + final pay tax
  const totalWithheld  = annualWithheld;
  const taxPayableCalc = taxDue - totalWithheld;

  // CSS shorthands
  const ROW = "display:flex;justify-content:space-between;align-items:center;padding:1.5px 7px;";
  const LBL = "font-size:8.5px;flex:1;";
  const AMT = "font-size:8.5px;font-variant-numeric:tabular-nums;text-align:right;min-width:74px;white-space:nowrap;";
  const REF = "font-size:7.5px;color:#666;min-width:28px;text-align:center;";

  // Build earnings rows HTML
  let earnHtml = "";
  let insertedSubHeader = false;
  for (const row of earnRows) {
    if (row.sub && !insertedSubHeader) {
      earnHtml += `<div style="${ROW}font-weight:600;"><span style="${LBL}">Other Earnings</span></div>`;
      insertedSubHeader = true;
    }
    earnHtml += `<div style="${ROW}">
      <span style="${LBL}${row.sub ? "padding-left:12px;" : ""}">${esc(row.label)}</span>
      <span style="${AMT}">${dash(row.amount)}</span>
    </div>`;
  }
  for (const row of extraEarns) {
    earnHtml += `<div style="${ROW}"><span style="${LBL}">${esc(row.label)}</span><span style="${AMT}">${f2(row.amount)}</span></div>`;
  }

  // Build deductions rows HTML
  let dedHtml = "";
  for (const row of dedRows) {
    const isTax = row.key === "tax_payable";
    const bg    = isTax && row.amount !== 0 ? "background:#add8e6;" : "";
    dedHtml += `<div style="${ROW}${bg}">
      <span style="${LBL}">${esc(row.label)}${isTax ? `<span style="font-size:7px;margin-left:2px;">(A)</span>` : ""}</span>
      <span style="${AMT}">${dash(row.amount)}</span>
    </div>`;
  }
  for (const row of extraDeds) {
    dedHtml += `<div style="${ROW}"><span style="${LBL}">${esc(row.label)}</span><span style="${AMT}">${f2(row.amount)}</span></div>`;
  }

  // Monthly rows for Part III table — use history data if available
  const TDC = "border:1px solid #999;padding:1px 3px;font-size:7px;text-align:right;font-variant-numeric:tabular-nums;";
  const monthRowsHtml = (hist?.months ?? Array.from({ length: 12 }, (_, i) => ({
    month: ["January","February","March","April","May","June","July","August","September","October","November","December"][i],
    basic_salary: 0, de_minimis: 0, other_earnings: 0, other_deductions: 0,
    sss_phc_hdmf: 0, taxable_earnings: 0, withheld: 0,
  }))).map((row) => {
    const d = (n: number) => n > 0 ? f2(n) : "&nbsp;";
    return `<tr>
      <td style="${TDC}text-align:left;">${row.month}</td>
      <td style="${TDC}">${d(row.basic_salary)}</td>
      <td style="${TDC}">${d(row.de_minimis)}</td>
      <td style="${TDC}">${d(row.other_earnings)}</td>
      <td style="${TDC}">${d(row.other_deductions)}</td>
      <td style="${TDC}">${d(row.sss_phc_hdmf)}</td>
      <td style="${TDC}">${d(row.taxable_earnings)}</td>
      <td style="${TDC}">${d(row.withheld)}</td>
    </tr>`;
  }).join("");

  const TH = "border:1px solid #999;padding:1.5px 3px;background:#e0e0e0;font-weight:700;font-size:7px;text-align:center;";
  const TD = "border:1px solid #999;padding:1px 3px;font-size:7px;text-align:right;font-variant-numeric:tabular-nums;";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Final Pay — ${esc(empName)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;font-size:8.5px;color:#000;padding:8px 10px;}
  @media print{body{padding:0;}@page{margin:7mm 9mm;size:A4 landscape;}}
</style>
</head>
<body>

<!-- ── Header ── -->
<div style="text-align:center;margin-bottom:5px;">
  <div style="font-weight:800;font-size:13px;color:#2a7a3b;letter-spacing:3px;line-height:1;">NORTH BREEDERS</div>
  <div style="font-size:8px;font-weight:700;margin-top:2px;letter-spacing:1.5px;">FINAL PAY COMPUTATION</div>
</div>

<!-- ── Part I ── -->
<div style="border:1px solid #555;padding:5px 8px;margin-bottom:4px;">
  <div style="font-size:7.5px;font-weight:700;text-transform:uppercase;color:#444;margin-bottom:3px;">Part I: Personal Information</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 28px;">
    <div>
      <div style="display:flex;gap:4px;padding:1px 0;font-size:8.5px;"><span style="font-weight:700;color:#555;min-width:108px;flex-shrink:0;">EMP. NO.</span><span>${esc(fp.employee?.employee_no ?? "—")}</span></div>
      <div style="display:flex;gap:4px;padding:1px 0;font-size:8.5px;"><span style="font-weight:700;color:#555;min-width:108px;flex-shrink:0;">NAME OF EMPLOYEE</span><span><b>${esc(empName)}</b></span></div>
      <div style="display:flex;gap:4px;padding:1px 0;font-size:8.5px;"><span style="font-weight:700;color:#555;min-width:108px;flex-shrink:0;">POSITION/DEPT.</span><span>—</span></div>
      <div style="display:flex;gap:4px;padding:1px 0;font-size:8.5px;"><span style="font-weight:700;color:#555;min-width:108px;flex-shrink:0;">BASIC SALARY</span><span>${Number(fp.basic_monthly) > 0 ? f2(fp.basic_monthly) : "—"}</span></div>
      <div style="display:flex;gap:4px;padding:1px 0;font-size:8.5px;"><span style="font-weight:700;color:#555;min-width:108px;flex-shrink:0;">DE MINIMIS</span><span>${deMinisFp > 0 ? f2(deMinisFp) : "0"}</span></div>
    </div>
    <div>
      <div style="display:flex;gap:4px;padding:1px 0;font-size:8.5px;"><span style="font-weight:700;color:#555;min-width:120px;flex-shrink:0;">DATE HIRED</span><span>—</span></div>
      <div style="display:flex;gap:4px;padding:1px 0;font-size:8.5px;"><span style="font-weight:700;color:#555;min-width:120px;flex-shrink:0;">END DATE</span><span>${esc(endDateLong)}</span></div>
      <div style="display:flex;gap:4px;padding:1px 0;font-size:8.5px;"><span style="font-weight:700;color:#555;min-width:120px;flex-shrink:0;">PAYROLL CUT-OFF DATE</span><span>${esc(cutoffDate)}</span></div>
    </div>
  </div>
</div>

<!-- ── Parts II & III ── -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">

  <!-- Part II: Final Pay Computation -->
  <div style="border:1px solid #555;">
    <div style="font-size:7.5px;font-weight:700;text-transform:uppercase;padding:2.5px 7px;background:#e0e0e0;border-bottom:1px solid #555;">Part II: Final Pay Computation</div>

    <!-- Earnings header -->
    <div style="${ROW}font-weight:700;border-bottom:1px solid #ccc;">
      <span style="${LBL}">Earnings</span>
      <span style="${AMT}">Amount</span>
    </div>

    ${earnHtml}

    <!-- Gross Pay -->
    <div style="${ROW}border-top:1px solid #555;background:#e0e0e0;font-weight:700;">
      <span style="${LBL}">Gross Pay</span>
      <span style="${AMT}">${f2(totalGross)}</span>
    </div>

    <!-- Deductions header -->
    <div style="${ROW}font-weight:700;border-top:1px solid #555;">
      <span style="${LBL}">Deductions</span>
    </div>

    ${dedHtml}

    <!-- Net Amount -->
    <div style="${ROW}border-top:2px solid #222;background:#ffff00;font-weight:700;font-size:9px;padding:3px 7px;">
      <span>FINAL PAY NET AMOUNT</span>
      <span style="font-variant-numeric:tabular-nums;">${f2(netPay)}</span>
    </div>
  </div>

  <!-- Part III: Annual Tax Computation -->
  <div style="border:1px solid #555;display:flex;flex-direction:column;">
    <div style="font-size:7.5px;font-weight:700;text-transform:uppercase;padding:2.5px 7px;background:#e0e0e0;border-bottom:1px solid #555;">Part III: Annual Tax Computation</div>

    <!-- Header row -->
    <div style="${ROW}border-bottom:1px solid #ccc;">
      <span style="${LBL}"></span>
      <span style="${REF}"></span>
      <span style="${AMT}font-weight:700;">Amount</span>
    </div>

    <!-- Annual Earnings -->
    <div style="${ROW}">
      <span style="${LBL}">Annual Earnings</span>
      <span style="${REF}">(A.1)</span>
      <span style="${AMT}">${annualEarnings > 0 ? f2(annualEarnings) : "&nbsp;"}</span>
    </div>
    <div style="${ROW}">
      <span style="${LBL}">Earnings to be received</span>
      <span style="${REF}"></span>
      <span style="${AMT}">${f2(earningsToReceive)}</span>
    </div>

    <div style="height:3px;"></div>

    <div style="${ROW}">
      <span style="${LBL}">SSS/PHC &amp; HDMF</span>
      <span style="${REF}"></span>
      <span style="${AMT}">${totalGovDed > 0 ? f2(totalGovDed) : "&nbsp;"}</span>
    </div>
    <div style="${ROW}">
      <span style="${LBL}">De Minimis</span>
      <span style="${REF}"></span>
      <span style="${AMT}">${totalDeMinis > 0 ? f2(totalDeMinis) : "&nbsp;"}</span>
    </div>
    <div style="${ROW}">
      <span style="${LBL}">Other Non-Taxable Salaries</span>
      <span style="${REF}"></span>
      <span style="${AMT}">&nbsp;</span>
    </div>

    <!-- Taxable earnings total -->
    <div style="${ROW}border-top:1px solid #555;background:#e0e0e0;font-weight:700;">
      <span style="${LBL}">Taxable earnings from Present Employer</span>
      <span style="${REF}"></span>
      <span style="${AMT}">${grossTaxable > 0 ? f2(grossTaxable) : "&nbsp;"}</span>
    </div>

    <div style="height:3px;"></div>

    <div style="${ROW}">
      <span style="${LBL}">Gross Taxable Annual Pay</span>
      <span style="${REF}"></span>
      <span style="${AMT}">${grossTaxable > 0 ? f2(grossTaxable) : "&nbsp;"}</span>
    </div>
    <div style="${ROW}">
      <span style="${LBL}">Tax Due</span>
      <span style="${REF}"></span>
      <span style="${AMT}">${taxDue > 0 ? f2(taxDue) : "&nbsp;"}</span>
    </div>
    <div style="${ROW}font-weight:600;">
      <span style="${LBL}">Deductions</span>
    </div>
    <div style="${ROW}padding-left:18px;">
      <span style="${LBL}">Withholding from Present Employer</span>
      <span style="${REF}">(A.2)</span>
      <span style="${AMT}">${totalWithheld > 0 ? f2(totalWithheld) : "&nbsp;"}</span>
    </div>

    <!-- Tax Payable (highlighted blue) -->
    <div style="${ROW}border-top:1px solid #555;background:#add8e6;font-weight:700;">
      <span style="${LBL}">Tax Payable (Refund)</span>
      <span style="${REF}"></span>
      <span style="${AMT}">${taxPayableCalc !== 0 ? f2(taxPayableCalc) : "&nbsp;"}</span>
    </div>

    <!-- Monthly breakdown table -->
    <table style="width:100%;border-collapse:collapse;margin-top:3px;flex:1;">
      <thead>
        <tr>
          <th style="${TH}text-align:left;min-width:42px;">Month</th>
          <th style="${TH}">Basic Salary</th>
          <th style="${TH}">De Minimis</th>
          <th style="${TH}">Other Earnings</th>
          <th style="${TH}">Other Deductions</th>
          <th style="${TH}">SSS/PHC &amp; HDMF</th>
          <th style="${TH}">Taxable Earnings</th>
          <th style="${TH}">Withheld</th>
        </tr>
      </thead>
      <tbody>
        ${monthRowsHtml}
        <tr style="background:#e0e0e0;font-weight:700;">
          <td style="${TD}text-align:left;"></td>
          <td style="${TD}text-align:center;">(A.1)</td>
          <td style="${TD}"></td><td style="${TD}"></td><td style="${TD}"></td><td style="${TD}"></td><td style="${TD}"></td>
          <td style="${TD}text-align:center;">(A.2)</td>
        </tr>
      </tbody>
    </table>
  </div>
</div>

<script>window.onload=function(){window.print()}<\/script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=1100,height=800");
  if (!win) { alert("Print window was blocked. Please allow pop-ups for this site."); return; }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

// ── actions dropdown ──────────────────────────────────────────────────────

function ActionsDropdown({ items }: {
  items: {
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    danger?: boolean;
    disabled?: boolean;
    hidden?: boolean;
  }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const visible = items.filter((i) => !i.hidden);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition shadow-sm">
        Actions
        <svg className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1.5 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
          {visible.map((item, i) => (
            <button key={i} disabled={item.disabled}
              onClick={() => { setOpen(false); item.onClick(); }}
              className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-sm transition disabled:opacity-50 ${item.danger ? "text-red-600 hover:bg-red-50" : "text-slate-700 hover:bg-slate-50"}`}>
              {item.icon && <span className="shrink-0">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── breakdown table ───────────────────────────────────────────────────────

function BreakdownRow({ label, amount, isTotal }: {
  label: string;
  amount: number;
  isTotal?: boolean;
}) {
  const zero = amount === 0;
  return (
    <div
      className={`grid border-b border-slate-100 last:border-0 ${
        isTotal
          ? "border-t-2 border-t-slate-200 bg-slate-50"
          : zero
          ? "opacity-40"
          : ""
      }`}
      style={{ gridTemplateColumns: "1fr auto" }}
    >
      <div className={`px-4 py-2 text-sm ${isTotal ? "font-bold text-slate-800" : "text-slate-700"}`}>
        {label}
      </div>
      <div className={`min-w-[100px] px-4 py-2 text-right text-sm tabular-nums ${
        isTotal ? "font-bold text-slate-900" : zero ? "text-slate-300" : "text-slate-800"
      }`}>
        {zero ? "—" : phpFmt(amount)}
      </div>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────

export default function FinalPayDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const qc      = useQueryClient();

  const { data: fp, isLoading, isError } = useQuery({
    queryKey: ["final-pays", Number(id)],
    queryFn:  () => finalPayApi.get(Number(id)),
  });

  const { data: history } = useQuery({
    queryKey: ["final-pays", Number(id), "payroll-history"],
    queryFn:  () => finalPayApi.payrollHistory(Number(id)),
    enabled:  !!fp,
    staleTime: 60_000,
  });

  const finalize = useMutation({
    mutationFn: () => finalPayApi.finalize(Number(id)),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["final-pays"] }),
  });

  const cancel = useMutation({
    mutationFn: (reason: string) => finalPayApi.cancel(Number(id), reason),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["final-pays"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => finalPayApi.delete(Number(id)),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ["final-pays"] }); router.replace("/final-pay"); },
  });

  const handleCancel = () => {
    const reason = window.prompt("Reason for cancellation (required):");
    if (reason === null) return;
    if (!reason.trim()) { alert("Please enter a reason."); return; }
    if (!window.confirm(`Cancel this record?\n\nReason: "${reason.trim()}"\n\nThis cannot be undone.`)) return;
    cancel.mutate(reason.trim());
  };

  if (isLoading) return (
    <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-slate-400">
      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
      </svg>
      Loading…
    </div>
  );

  if (isError || !fp) return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
      Failed to load this record.
    </div>
  );

  const empName     = fp.employee ? `${fp.employee.first_name} ${fp.employee.last_name}` : `Employee #${fp.employee_id}`;
  const isFinalized = fp.status === "finalized";
  const isCancelled = fp.status === "cancelled";

  const earningRows   = fp.earnings_breakdown  ?? [];
  const deductionRows = fp.deductions_breakdown ?? [];

  const totalGross      = Number(fp.total_gross);
  const totalDeductions = Number(fp.total_deductions_amount);
  const netPay          = Number(fp.net_final_pay);

  const cutoffMatch = fp.notes?.match(/Payroll cut-off: (.+)/);
  const cutoffDate  = cutoffMatch ? cutoffMatch[1] : null;
  const otherNotes  = fp.notes?.replace(/Payroll cut-off: .+/, "").trim() || null;

  const statusBadge = isCancelled
    ? <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 ring-1 ring-red-200"><span className="h-1.5 w-1.5 rounded-full bg-red-400 inline-block"/>Cancelled</span>
    : isFinalized
    ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block"/>Finalized</span>
    : <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200"><span className="h-1.5 w-1.5 rounded-full bg-amber-400 inline-block"/>Draft</span>;

  const infoRow = (label: string, value: string) => (
    <div key={label} className="grid items-baseline gap-2" style={{ gridTemplateColumns: "130px 1fr" }}>
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="border-b border-slate-100 pb-0.5 text-[13px] text-slate-700">{value}</span>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Back */}
      <button onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-700 transition">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Final Pay
      </button>

      {/* Header */}
      <div className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${isCancelled ? "border-red-200" : "border-slate-200"}`}>
        <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-3 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-slate-400">Final Pay Computation</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-4">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-base font-bold ${isCancelled ? "bg-red-100 text-red-500" : "bg-slate-100 text-slate-600"}`}>
              {initials(empName)}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className={`text-lg font-bold ${isCancelled ? "line-through text-slate-400" : "text-slate-900"}`}>{empName}</h1>
                {statusBadge}
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                {fp.employee?.employee_no && <><span className="font-medium">{fp.employee.employee_no}</span> · </>}
                {SEP_LABELS[fp.separation_type]} · Last day: <span className="font-medium text-slate-700">{fmtDate(fp.last_working_day)}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => printFinalPay(fp, history)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition shadow-sm">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
              </svg>
              Print / PDF
            </button>
            <ActionsDropdown items={[
            {
              label: finalize.isPending ? "Finalizing…" : "Finalize",
              hidden: isCancelled || isFinalized,
              disabled: finalize.isPending,
              onClick: () => { if (window.confirm("Finalize this record? This marks it as official.")) finalize.mutate(); },
              icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>,
            },
            {
              label: cancel.isPending ? "Cancelling…" : "Cancel Record",
              hidden: isCancelled,
              disabled: cancel.isPending,
              danger: true,
              onClick: handleCancel,
              icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>,
            },
            {
              label: deleteMutation.isPending ? "Deleting…" : "Delete",
              danger: true,
              disabled: deleteMutation.isPending,
              onClick: () => { if (window.confirm("Permanently delete this record? This cannot be undone.")) deleteMutation.mutate(); },
              icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>,
            },
          ]} />
          </div>
        </div>
      </div>

      {/* Cancellation notice */}
      {isCancelled && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
          <svg className="mt-0.5 h-5 w-5 shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          <div>
            <p className="text-sm font-semibold text-red-700">This record has been cancelled.</p>
            {fp.notes && !cutoffDate && <p className="mt-0.5 text-sm text-red-600">Reason: {fp.notes}</p>}
          </div>
        </div>
      )}

      {/* Document body */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="p-5 space-y-6">

          {/* Part I */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Part I</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Personal Information</span>
            </div>
            <div className="grid grid-cols-1 gap-y-2 sm:grid-cols-2 sm:gap-x-10">
              {infoRow("EMP. NO.",        fp.employee?.employee_no ?? "—")}
              {infoRow("DATE HIRED",      "—")}
              {infoRow("NAME",            empName)}
              {infoRow("END DATE",        fmtDate(fp.last_working_day))}
              {infoRow("POSITION/DEPT.",  "—")}
              {infoRow("PAYROLL CUT-OFF", cutoffDate ?? "—")}
              {infoRow("BASIC SALARY",    Number(fp.basic_monthly) > 0 ? php(fp.basic_monthly) : "—")}
              {infoRow("SEPARATION TYPE", SEP_LABELS[fp.separation_type] ?? fp.separation_type)}
              {infoRow("DE MINIMIS",      "—")}
              {infoRow("PREPARED BY",     fp.computed_by?.name ?? "—")}
            </div>
          </section>

          {/* Part II */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Part II</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Final Pay Computation</span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Earnings */}
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Earnings</span>
                  <span className="text-xs font-semibold text-slate-400">Amount</span>
                </div>
                {earningRows.length > 0 ? (
                  earningRows.map((row, i) => (
                    <BreakdownRow key={i} label={row.label ?? ""} amount={Number(row.amount ?? 0)} />
                  ))
                ) : (
                  <div className="px-4 py-6 text-center text-sm text-slate-400">No earnings data.</div>
                )}
                <BreakdownRow label="Gross" amount={totalGross} isTotal />
              </div>

              {/* Deductions */}
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Deductions</span>
                  <span className="text-xs font-semibold text-slate-400">Amount</span>
                </div>
                {deductionRows.length > 0 ? (
                  deductionRows.map((row, i) => (
                    <BreakdownRow key={i} label={row.label ?? ""} amount={Number(row.amount ?? 0)} />
                  ))
                ) : (
                  <div className="px-4 py-6 text-center text-sm text-slate-400">No deductions.</div>
                )}
                <BreakdownRow label="Total Deductions" amount={totalDeductions} isTotal />
              </div>
            </div>

            {/* Net pay */}
            <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-900 px-5 py-3.5">
              <span className="text-[10px] font-bold uppercase tracking-[.2em] text-slate-400">Final Pay Net Amount</span>
              <span className="text-2xl font-bold tabular-nums text-white">{php(netPay)}</span>
            </div>
          </section>

          {/* Part III: Annual Tax Computation */}
          {history && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <span className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Part III</span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Annual Tax Computation</span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[640px] text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      {["Month","Basic Salary","De Minimis","Other Earnings","Other Deductions","SSS/PHC & HDMF","Taxable Earnings","Withheld"].map((h) => (
                        <th key={h} className="px-3 py-2 text-right font-semibold text-slate-500 first:text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {history.months.map((row) => {
                      const any = row.basic_salary > 0 || row.other_earnings > 0 || row.withheld > 0;
                      return (
                        <tr key={row.month} className={any ? "" : "opacity-30"}>
                          <td className="px-3 py-1.5 font-medium text-slate-700">{row.month}</td>
                          {([row.basic_salary, row.de_minimis, row.other_earnings, row.other_deductions, row.sss_phc_hdmf, row.taxable_earnings, row.withheld] as number[]).map((v, i) => (
                            <td key={i} className="px-3 py-1.5 text-right tabular-nums text-slate-600">
                              {v > 0 ? phpFmt(v) : "—"}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                      <td className="px-3 py-2 text-slate-700">Total</td>
                      {(["basic_salary","de_minimis","other_earnings","other_deductions","sss_phc_hdmf","taxable_earnings","withheld"] as const).map((k) => (
                        <td key={k} className="px-3 py-2 text-right tabular-nums text-slate-900">
                          {history.totals[k] > 0 ? phpFmt(history.totals[k]) : "—"}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          )}

          {/* Notes */}
          {otherNotes && !isCancelled && (
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Notes</p>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{otherNotes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
