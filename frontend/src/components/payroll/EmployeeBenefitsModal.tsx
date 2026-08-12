"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { SearchSelect } from "@/components/SearchSelect";
import { inputCls, labelCls } from "@/lib/form-classes";
import { payItemsApi, peso, PAY_ITEM_CADENCES, type PayItemCadence } from "@/lib/payroll";

/**
 * Manage an employee's HR-defined recurring pay benefits/allowances — HR names
 * each benefit, sets the amount and how it's paid (per month / per cutoff / per
 * day of attendance). They add to pay on the next Compute.
 */
export function EmployeeBenefitsModal({ employeeId, employeeName, onClose }: { employeeId: number; employeeName: string; onClose: () => void }) {
  const qc = useQueryClient();
  const key = ["pay-items", employeeId];
  const { data: items = [], isLoading } = useQuery({ queryKey: key, queryFn: () => payItemsApi.list(employeeId) });

  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState<PayItemCadence>("monthly");

  const invalidate = () => qc.invalidateQueries({ queryKey: key });
  const add = useMutation({
    mutationFn: () => payItemsApi.create({ employee_id: employeeId, label: label.trim(), amount: Number(amount), cadence }),
    onSuccess: () => { toast.success("Benefit added — press Compute on the run to apply."); setLabel(""); setAmount(""); setCadence("monthly"); invalidate(); },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to add."),
  });
  const remove = useMutation({
    mutationFn: (id: number) => payItemsApi.remove(id),
    onSuccess: () => { toast.success("Removed."); invalidate(); },
  });

  const cadenceLabel = (c: string) => PAY_ITEM_CADENCES.find((x) => x.value === c)?.label ?? c;
  const canAdd = label.trim().length > 0 && Number(amount) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Benefits &amp; allowances</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
        <p className="mb-4 text-sm text-slate-500">{employeeName} — add any recurring benefit. It's added to pay on the next Compute.</p>

        <div className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-[1fr_7rem_9rem_auto] sm:items-end">
          <div>
            <label className={labelCls}>Benefit name</label>
            <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Rice subsidy, HMO, Hazard pay" />
          </div>
          <div>
            <label className={labelCls}>Amount</label>
            <input type="number" min="0" step="0.01" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <label className={labelCls}>How paid</label>
            <SearchSelect className={inputCls} value={cadence} onChange={(v) => setCadence(v as PayItemCadence)}
              options={PAY_ITEM_CADENCES.map((c) => ({ value: c.value, label: c.label }))} />
          </div>
          <button onClick={() => add.mutate()} disabled={!canAdd || add.isPending}
            className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            Add
          </button>
        </div>
        <p className="-mt-2 mb-4 text-xs text-slate-400">{PAY_ITEM_CADENCES.find((c) => c.value === cadence)?.hint}</p>

        {isLoading ? (
          <p className="py-4 text-center text-sm text-slate-400">Loading…</p>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-sm text-slate-500">No benefits yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((it) => (
              <li key={it.id} className="flex items-center justify-between py-2.5">
                <div>
                  <span className="text-sm font-medium text-slate-800">{it.label}</span>
                  <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">{peso(it.amount)}</span>
                  <span className="ml-2 text-xs text-slate-400">{cadenceLabel(it.cadence)}</span>
                  {!it.is_active && <span className="ml-2 text-xs text-rose-500">paused</span>}
                </div>
                <button onClick={() => remove.mutate(it.id)} disabled={remove.isPending} className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50">Remove</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
