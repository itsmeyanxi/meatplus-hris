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

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  if (!strong && (value === peso(0) || value === "₱0.00")) return null;
  return (
    <div className={`flex items-center justify-between py-1 ${strong ? "border-t border-slate-200 pt-2 font-semibold text-slate-900" : muted ? "text-slate-500" : "text-slate-700"}`}>
      <span className="text-sm">{label}</span>
      <span className="text-sm tabular-nums">{value}</span>
    </div>
  );
}

function PayslipModal({ detail, onClose }: { detail: MyPayslipDetail; onClose: () => void }) {
  const e = detail.earnings;
  const d = detail.deductions;
  return (
    <div className="fixed inset-0 z-[9998] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 print:static print:bg-white print:p-0" onClick={onClose}>
      <div className="my-8 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl print:my-0 print:max-w-none print:shadow-none" onClick={(ev) => ev.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{detail.company.name}</h2>
            <p className="text-sm text-slate-500">Payslip · {detail.run.period_start} → {detail.run.period_end}</p>
            <p className="text-xs text-slate-400">Pay date {detail.run.pay_date}</p>
          </div>
          <div className="text-right">
            <div className="font-semibold text-slate-800">{detail.employee.name}</div>
            <div className="font-mono text-xs text-slate-400">{detail.employee.employee_no}</div>
            <div className="text-xs text-slate-400">{detail.employee.position ?? ""}</div>
          </div>
        </div>

        {/* Body */}
        <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">Earnings</h3>
            <Row label="Basic pay" value={peso(e.basic_pay)} />
            <Row label="Overtime" value={peso(e.overtime_pay)} />
            <Row label="Night differential" value={peso(e.night_diff_pay)} />
            <Row label="Holiday pay" value={peso(e.holiday_pay)} />
            <Row label="Rest day pay" value={peso(e.rest_day_pay)} />
            <Row label="Allowance" value={peso(e.allowance)} />
            <Row label="Other earnings" value={peso(e.other_earnings)} />
            <Row label="Gross pay" value={peso(e.gross_pay)} strong />
          </div>
          <div>
            <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">Deductions</h3>
            <Row label="SSS" value={peso(d.sss)} muted />
            <Row label="PhilHealth" value={peso(d.philhealth)} muted />
            <Row label="Pag-IBIG" value={peso(d.pagibig)} muted />
            <Row label="Withholding tax" value={peso(d.withholding_tax)} muted />
            <Row label="Tardiness" value={peso(d.tardiness_deduction)} muted />
            <Row label="Loans" value={peso(d.loans_deduction)} muted />
            <Row label="Other deductions" value={peso(d.other_deductions)} muted />
            <Row label="Total deductions" value={peso(d.total_deductions)} strong />
          </div>
        </div>

        {/* Attendance line */}
        <p className="mt-4 text-xs text-slate-400">
          {Number(detail.attendance.days_worked)} day(s) worked · {detail.attendance.overtime_minutes} OT min · {detail.attendance.late_minutes} late min · {detail.attendance.days_absent} absent
        </p>

        {/* Net */}
        <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3 text-white">
          <span className="text-sm font-medium">NET PAY</span>
          <span className="text-xl font-bold tabular-nums">{peso(detail.net_pay)}</span>
        </div>

        <div className="mt-5 flex justify-end gap-2 print:hidden">
          <AppButton variant="secondary" onClick={onClose}>Close</AppButton>
          <AppButton onClick={() => window.print()}>Print / Save PDF</AppButton>
        </div>
      </div>
    </div>
  );
}
