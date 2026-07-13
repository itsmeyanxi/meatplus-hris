"use client";

import { useMemo, useState } from "react";
import { AppButton, TableShell } from "@/components/ui";
import { inputCls, labelCls } from "@/lib/form-classes";
import { peso } from "@/lib/payroll";

// UI shell only — advances are held in local state for preview. Persisting them
// (a backend table + API, and folding the per-period deduction into payroll runs)
// is a later pass.

type Advance = {
  id: number;
  loan_type: string;
  date_request: string;
  date_released: string;
  start_deduction: string;
  end_deduction: string;
  total_amount: number;
  pay_periods: number;
  pay_amount_per_period: number;
  total_paid: number;
};

const LOAN_TYPES = ["Cash Advance", "SSS Loan", "Pag-IBIG Loan", "Company Loan", "Others"];

const COLS = [
  "Loan Type",
  "Date Request",
  "Date Released",
  "Start Of Deduction",
  "End Of Deduction",
  "Total Amount",
  "Pay Periods",
  "Pay Amount/Period",
  "Total Paid Amounts",
  "Balance",
];

export function AdvancesSection() {
  const [rows, setRows] = useState<Advance[]>([]);
  const [showForm, setShowForm] = useState(false);

  const outstanding = useMemo(
    () => rows.reduce((sum, r) => sum + (r.total_amount - r.total_paid), 0),
    [rows],
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-2.5 text-xs text-amber-800">
        Preview only — advances aren&apos;t saved to the server yet. Persisting them and folding the
        per-period deduction into payroll runs is the next step.
      </div>

      <div>
        <AppButton onClick={() => setShowForm(true)}>+ Add Transaction</AppButton>
      </div>

      <TableShell>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                {COLS.map((c) => (
                  <th key={c} className="whitespace-nowrap px-4 py-3">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={COLS.length} className="px-4 py-8 text-center text-xs text-slate-400">
                    No advances yet. Use “Add Transaction” to record a cash advance or loan.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const balance = r.total_amount - r.total_paid;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/60">
                      <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-800">{r.loan_type}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{r.date_request || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{r.date_released || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{r.start_deduction || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{r.end_deduction || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{peso(r.total_amount)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{r.pay_periods}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{peso(r.pay_amount_per_period)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{peso(r.total_paid)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums">{peso(balance)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </TableShell>

      <div className="max-w-md">
        <label className="mb-1 block text-sm text-slate-600">Current Outstanding Balance:</label>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right font-semibold tabular-nums text-slate-800">
          {peso(outstanding)}
        </div>
      </div>

      {showForm && (
        <AddTransactionModal
          onClose={() => setShowForm(false)}
          onAdd={(a) => {
            setRows((prev) => [...prev, { ...a, id: Date.now() }]);
            setShowForm(false);
          }}
        />
      )}
    </div>
  );
}

function AddTransactionModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (a: Omit<Advance, "id">) => void;
}) {
  const [f, setF] = useState({
    loan_type: LOAN_TYPES[0],
    date_request: "",
    date_released: "",
    start_deduction: "",
    end_deduction: "",
    total_amount: "",
    pay_periods: "",
    total_paid: "",
  });
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));

  const total = Number(f.total_amount) || 0;
  const periods = Number(f.pay_periods) || 0;
  const perPeriod = periods > 0 ? total / periods : 0;

  const submit = () => {
    onAdd({
      loan_type: f.loan_type,
      date_request: f.date_request,
      date_released: f.date_released,
      start_deduction: f.start_deduction,
      end_deduction: f.end_deduction,
      total_amount: total,
      pay_periods: periods,
      pay_amount_per_period: perPeriod,
      total_paid: Number(f.total_paid) || 0,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">Add Transaction</h2>

        <div className="mt-4 space-y-4">
          <div>
            <label className={labelCls}>Loan Type</label>
            <select className={inputCls} value={f.loan_type} onChange={(e) => set("loan_type", e.target.value)}>
              {LOAN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Date Request</label>
              <input className={inputCls} type="date" value={f.date_request} onChange={(e) => set("date_request", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Date Released</label>
              <input className={inputCls} type="date" value={f.date_released} onChange={(e) => set("date_released", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Start Of Deduction</label>
              <input className={inputCls} type="date" value={f.start_deduction} onChange={(e) => set("start_deduction", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>End Of Deduction</label>
              <input className={inputCls} type="date" value={f.end_deduction} onChange={(e) => set("end_deduction", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Total Amount</label>
              <input className={inputCls} type="number" min={0} step="0.01" value={f.total_amount} onChange={(e) => set("total_amount", e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className={labelCls}>Pay Periods</label>
              <input className={inputCls} type="number" min={0} step="1" value={f.pay_periods} onChange={(e) => set("pay_periods", e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className={labelCls}>Pay Amount / Period</label>
              <input className={`${inputCls} bg-slate-50`} value={perPeriod ? peso(perPeriod) : "—"} readOnly />
            </div>
            <div>
              <label className={labelCls}>Total Paid Amounts</label>
              <input className={inputCls} type="number" min={0} step="0.01" value={f.total_paid} onChange={(e) => set("total_paid", e.target.value)} placeholder="0.00" />
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <AppButton type="button" variant="secondary" onClick={onClose}>Cancel</AppButton>
          <AppButton type="button" onClick={submit} disabled={!total || !periods}>Add</AppButton>
        </div>
      </div>
    </div>
  );
}
