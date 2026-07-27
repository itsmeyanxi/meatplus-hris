"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader, AppButton, TableShell } from "@/components/ui";
import { myPayslipsApi, peso, type MyPayslipDetail } from "@/lib/payroll";

export default function MyPayslipsPage() {
  const { data: slips = [], isLoading } = useQuery({ queryKey: ["my-payslips"], queryFn: myPayslipsApi.list });
  const [openId, setOpenId] = useState<number | null>(null);

  const { data: detail } = useQuery({
    queryKey: ["my-payslip", openId],
    queryFn: () => myPayslipsApi.get(openId as number),
    enabled: openId !== null,
  });

  return (
    <div className="space-y-6">
      <PageHeader title="My Payslips" description="Your released payslips. Open one to view the full breakdown and print or save it as PDF." />

      {isLoading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : slips.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No payslips yet. They appear here once payroll for a period has been approved.
        </div>
      ) : (
        <TableShell>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Pay date</th>
                <th className="px-4 py-3 text-right">Gross</th>
                <th className="px-4 py-3 text-right">Deductions</th>
                <th className="px-4 py-3 text-right">Net pay</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {slips.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-800">{s.run.period_start} → {s.run.period_end}</div>
                    <div className="text-xs text-slate-400">{s.run.name}</div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{s.run.pay_date}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{peso(s.gross_pay)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">{peso(s.total_deductions)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">{peso(s.net_pay)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => setOpenId(s.id)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      )}

      {openId !== null && detail && <PayslipModal detail={detail} onClose={() => setOpenId(null)} />}
    </div>
  );
}

/** Plain 2-decimal amount, no currency sign — matches the official payslip. */
const amt = (v: number) => Number(v ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A "LABEL : value" cell in the identification grid. */
function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex px-2 py-1.5">
      <span className="w-32 shrink-0 font-bold text-slate-800">{label}</span>
      <span className="text-slate-700">: {value || "—"}</span>
    </div>
  );
}

/** One amount column (Compensation / Deductions / Year-to-Date). */
function Col({ title, lines, className = "" }: { title: string; lines: { label: string; note?: string; amount: number }[]; className?: string }) {
  return (
    <div className={className}>
      <div className="border-b border-slate-800 bg-slate-100 py-1 text-center text-xs font-bold uppercase tracking-wide text-slate-800">{title}</div>
      <div className="min-h-[220px] px-2 py-1.5">
        {lines.map((l, i) => (
          <div key={i} className="flex items-baseline justify-between gap-2 py-0.5">
            <span className="font-semibold text-slate-800">
              {l.label}{l.note ? <span className="ml-1 font-normal text-slate-500">{l.note}</span> : null}
            </span>
            <span className="tabular-nums text-slate-800">{amt(l.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PayslipModal({ detail, onClose }: { detail: MyPayslipDetail; onClose: () => void }) {
  const ytd = detail.ytd;
  const ytdLines = [
    { label: "TAXABLE GROSS", amount: ytd.taxable_gross },
    { label: "TAX", amount: ytd.tax },
    { label: "SSS", amount: ytd.sss },
    { label: "PHIC", amount: ytd.phic },
    { label: "HDMF", amount: ytd.hdmf },
    { label: "GROSS INCOME", amount: ytd.gross_income },
    { label: "NON TAXABLE", amount: ytd.non_taxable },
  ];

  return (
    <div className="fixed inset-0 z-[9998] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 print:static print:bg-white print:p-0" onClick={onClose}>
      <div className="my-8 w-full max-w-3xl" onClick={(ev) => ev.stopPropagation()}>
        <div id="payslip-print" className="border-2 border-slate-800 bg-white text-[13px] text-slate-900">
          {/* Company header */}
          <div className="border-b-2 border-slate-800 px-4 py-2.5 text-center">
            <div className="text-base font-bold uppercase leading-tight">{detail.company.name}</div>
            {detail.company.address && <div className="text-sm font-bold uppercase leading-tight">{detail.company.address}</div>}
          </div>

          {/* Identification grid */}
          <div className="grid grid-cols-1 border-b-2 border-slate-800 sm:grid-cols-2">
            <div className="divide-y divide-slate-300 sm:border-r-2 sm:border-slate-800">
              <Info label="NAME" value={detail.employee.name} />
              <Info label="PAYROLL DATE" value={detail.payroll_date} />
              <Info label="DATE COVERED" value={detail.date_covered ? `Payroll for ${detail.date_covered}` : null} />
              <Info label="DEPARTMENT" value={detail.employee.department} />
            </div>
            <div className="divide-y divide-slate-300">
              <Info label="TIN" value={detail.employee.tin} />
              <Info label="SSS NO." value={detail.employee.sss_no} />
              <Info label="PHILHEALTH NO." value={detail.employee.philhealth_no} />
              <Info label="HDMF" value={detail.employee.hdmf_no} />
            </div>
          </div>

          {/* Three columns */}
          <div className="grid grid-cols-1 border-b-2 border-slate-800 sm:grid-cols-3">
            <Col title="Compensation" lines={detail.compensation} className="sm:border-r-2 sm:border-slate-800" />
            <Col title="Deductions" lines={detail.deductions} className="border-t border-slate-800 sm:border-t-0 sm:border-r-2 sm:border-slate-800" />
            <Col title="Year-to-Date" lines={ytdLines} className="border-t border-slate-800 sm:border-t-0" />
          </div>

          {/* Totals footer */}
          <div className="grid grid-cols-1 text-sm font-bold sm:grid-cols-3">
            <div className="flex items-center justify-between gap-2 px-3 py-2 sm:border-r-2 sm:border-slate-800">
              <span className="text-slate-800">TOTAL COMPENSATION</span><span className="tabular-nums">{amt(detail.total_compensation)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-slate-800 px-3 py-2 sm:border-t-0 sm:border-r-2 sm:border-slate-800">
              <span className="text-slate-800">TOTAL DEDUCTIONS</span><span className="tabular-nums">{amt(detail.total_deductions)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-slate-800 px-3 py-2 sm:border-t-0">
              <span className="text-slate-800">NET PAY</span><span className="tabular-nums">{amt(detail.net_pay)}</span>
            </div>
          </div>
        </div>

        {/* Actions (never printed) */}
        <div className="mt-4 flex justify-end gap-2 print:hidden">
          <AppButton variant="secondary" onClick={onClose}>Close</AppButton>
          <AppButton onClick={() => window.print()}>Print / Save PDF</AppButton>
        </div>
      </div>
    </div>
  );
}
