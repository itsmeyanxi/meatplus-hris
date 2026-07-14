"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppButton, TableShell } from "@/components/ui";
import { inputCls, labelCls } from "@/lib/form-classes";
import { peso } from "@/lib/payroll";
import { employeeRecordsApi, type RecordRow } from "@/lib/employee-records";

type AdvanceData = {
  loan_type: string;
  date_request: string;
  date_released: string;
  start_deduction: string;
  end_deduction: string;
  total_amount: number;
  pay_periods: number;
  total_paid: number;
};

const LOAN_TYPES = ["Cash Advance", "SSS Loan", "Pag-IBIG Loan", "Company Loan", "Others"];

const COLS = [
  "Loan Type", "Date Request", "Date Released", "Start Of Deduction", "End Of Deduction",
  "Total Amount", "Pay Periods", "Pay Amount/Period", "Total Paid Amounts", "Balance",
];

export function AdvancesSection({ employeeId }: { employeeId: number }) {
  const qc = useQueryClient();
  const key = ["employee", employeeId, "records", "advance"];
  const [showForm, setShowForm] = useState(false);

  const { data: rows, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => employeeRecordsApi.list(employeeId, "advance"),
    enabled: !!employeeId,
  });

  const create = useMutation({
    mutationFn: (data: AdvanceData) => employeeRecordsApi.create(employeeId, "advance", data),
    onSuccess: () => { toast.success("Advance saved."); qc.invalidateQueries({ queryKey: key }); setShowForm(false); },
    onError: () => toast.error("Could not save the advance."),
  });
  const destroy = useMutation({
    mutationFn: (id: number) => employeeRecordsApi.destroy(employeeId, "advance", id),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: () => toast.error("Could not remove."),
  });

  const num = (v: unknown) => Number(v ?? 0) || 0;
  const outstanding = useMemo(
    () => (rows ?? []).reduce((sum, r) => sum + (num(r.total_amount) - num(r.total_paid)), 0),
    [rows],
  );

  return (
    <div className="space-y-4">
      <div>
        <AppButton onClick={() => setShowForm(true)}>+ Add Transaction</AppButton>
      </div>

      <TableShell>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                {COLS.map((c) => <th key={c} className="whitespace-nowrap px-4 py-3">{c}</th>)}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={COLS.length + 1} className="px-4 py-8 text-center text-xs text-slate-400">Loading…</td></tr>
              ) : (rows?.length ?? 0) === 0 ? (
                <tr><td colSpan={COLS.length + 1} className="px-4 py-8 text-center text-xs text-slate-400">No advances yet.</td></tr>
              ) : (
                rows!.map((r) => {
                  const total = num(r.total_amount), periods = num(r.pay_periods), paid = num(r.total_paid);
                  const perPeriod = periods > 0 ? total / periods : 0;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/60">
                      <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-800">{String(r.loan_type ?? "—")}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{String(r.date_request ?? "") || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{String(r.date_released ?? "") || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{String(r.start_deduction ?? "") || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{String(r.end_deduction ?? "") || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{peso(total)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{periods}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{peso(perPeriod)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{peso(paid)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums">{peso(total - paid)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">
                        <button type="button" onClick={() => destroy.mutate(r.id)} disabled={destroy.isPending} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-red-600 disabled:opacity-50">Remove</button>
                      </td>
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
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right font-semibold tabular-nums text-slate-800">{peso(outstanding)}</div>
      </div>

      {showForm && (
        <AddTransactionModal saving={create.isPending} onClose={() => setShowForm(false)} onAdd={(a) => create.mutate(a)} />
      )}
    </div>
  );
}

function AddTransactionModal({ saving, onClose, onAdd }: { saving: boolean; onClose: () => void; onAdd: (a: AdvanceData) => void }) {
  const [f, setF] = useState({
    loan_type: LOAN_TYPES[0], date_request: "", date_released: "", start_deduction: "",
    end_deduction: "", total_amount: "", pay_periods: "", total_paid: "",
  });
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const total = Number(f.total_amount) || 0;
  const periods = Number(f.pay_periods) || 0;
  const perPeriod = periods > 0 ? total / periods : 0;

  const submit = () => onAdd({
    loan_type: f.loan_type, date_request: f.date_request, date_released: f.date_released,
    start_deduction: f.start_deduction, end_deduction: f.end_deduction,
    total_amount: total, pay_periods: periods, total_paid: Number(f.total_paid) || 0,
  });

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
            <div><label className={labelCls}>Date Request</label><input className={inputCls} type="date" value={f.date_request} onChange={(e) => set("date_request", e.target.value)} /></div>
            <div><label className={labelCls}>Date Released</label><input className={inputCls} type="date" value={f.date_released} onChange={(e) => set("date_released", e.target.value)} /></div>
            <div><label className={labelCls}>Start Of Deduction</label><input className={inputCls} type="date" value={f.start_deduction} onChange={(e) => set("start_deduction", e.target.value)} /></div>
            <div><label className={labelCls}>End Of Deduction</label><input className={inputCls} type="date" value={f.end_deduction} onChange={(e) => set("end_deduction", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Total Amount</label><input className={inputCls} type="number" min={0} step="0.01" value={f.total_amount} onChange={(e) => set("total_amount", e.target.value)} placeholder="0.00" /></div>
            <div><label className={labelCls}>Pay Periods</label><input className={inputCls} type="number" min={0} step="1" value={f.pay_periods} onChange={(e) => set("pay_periods", e.target.value)} placeholder="0" /></div>
            <div><label className={labelCls}>Pay Amount / Period</label><input className={`${inputCls} bg-slate-50`} value={perPeriod ? peso(perPeriod) : "—"} readOnly /></div>
            <div><label className={labelCls}>Total Paid Amounts</label><input className={inputCls} type="number" min={0} step="0.01" value={f.total_paid} onChange={(e) => set("total_paid", e.target.value)} placeholder="0.00" /></div>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <AppButton type="button" variant="secondary" onClick={onClose}>Cancel</AppButton>
          <AppButton type="button" onClick={submit} disabled={!total || !periods || saving}>{saving ? "Saving…" : "Add"}</AppButton>
        </div>
      </div>
    </div>
  );
}

export type { RecordRow };
