"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { SearchSelect } from "@/components/SearchSelect";
import { inputCls, labelCls } from "@/lib/form-classes";
import { payItemsApi, peso, PAY_ITEM_CADENCES, type PayItem, type PayItemCadence } from "@/lib/payroll";

/**
 * Manage an employee's HR-defined recurring pay benefits/allowances — add, edit
 * (amount / cadence / taxable) or remove. HR names each benefit, sets the amount,
 * how it's paid, and whether it's taxable. They apply on the next Compute.
 */
export function EmployeeBenefitsModal({ employeeId, employeeName, onClose }: { employeeId: number; employeeName: string; onClose: () => void }) {
  const qc = useQueryClient();
  const key = ["pay-items", employeeId];
  const { data: items = [], isLoading } = useQuery({ queryKey: key, queryFn: () => payItemsApi.list(employeeId) });
  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  // ── Add form ───────────────────────────────────────────────────────────────
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState<PayItemCadence>("monthly");
  const [taxable, setTaxable] = useState(false);
  const add = useMutation({
    mutationFn: () => payItemsApi.create({ employee_id: employeeId, label: label.trim(), amount: Number(amount), cadence, taxable }),
    onSuccess: () => { toast.success("Benefit added — press Compute on the run to apply."); setLabel(""); setAmount(""); setCadence("monthly"); setTaxable(false); invalidate(); },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to add."),
  });
  const canAdd = label.trim().length > 0 && Number(amount) > 0;

  // ── Edit (inline) ────────────────────────────────────────────────────────────
  const [editId, setEditId] = useState<number | null>(null);
  const [ed, setEd] = useState<{ label: string; amount: string; cadence: PayItemCadence; taxable: boolean }>({ label: "", amount: "", cadence: "monthly", taxable: false });
  const startEdit = (it: PayItem) => { setEditId(it.id); setEd({ label: it.label, amount: String(it.amount), cadence: it.cadence, taxable: it.taxable }); };
  const update = useMutation({
    mutationFn: () => payItemsApi.update(editId!, { label: ed.label.trim(), amount: Number(ed.amount), cadence: ed.cadence, taxable: ed.taxable }),
    onSuccess: () => { toast.success("Benefit updated — press Compute to apply."); setEditId(null); invalidate(); },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to update."),
  });
  const remove = useMutation({
    mutationFn: (id: number) => payItemsApi.remove(id),
    onSuccess: () => { toast.success("Removed."); invalidate(); },
  });

  const cadenceLabel = (c: string) => PAY_ITEM_CADENCES.find((x) => x.value === c)?.label ?? c;
  const taxOptions = [{ value: "0", label: "Non-taxable" }, { value: "1", label: "Taxable" }];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Benefits &amp; allowances</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
        <p className="mb-4 text-sm text-slate-500">{employeeName} — add any recurring benefit. It's added to pay on the next Compute.</p>

        {/* Add form — name on its own row, then amount / cadence / tax */}
        <div className="mb-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <div className="mb-3">
            <label className={labelCls}>Benefit name</label>
            <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Rice subsidy, HMO, Hazard pay" />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-28">
              <label className={labelCls}>Amount</label>
              <input type="number" min="0" step="0.01" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="w-44">
              <label className={labelCls}>How paid</label>
              <SearchSelect className={inputCls} value={cadence} onChange={(v) => setCadence(v as PayItemCadence)} options={PAY_ITEM_CADENCES.map((c) => ({ value: c.value, label: c.label }))} />
            </div>
            <div className="w-40">
              <label className={labelCls}>Tax</label>
              <SearchSelect className={inputCls} value={taxable ? "1" : "0"} onChange={(v) => setTaxable(v === "1")} options={taxOptions} />
            </div>
            <button onClick={() => add.mutate()} disabled={!canAdd || add.isPending}
              className="ml-auto rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              Add
            </button>
          </div>
        </div>
        <p className="mb-4 text-xs text-slate-400">
          {PAY_ITEM_CADENCES.find((c) => c.value === cadence)?.hint}. {taxable ? "Taxable — added to the withholding-tax base." : "Non-taxable — added to pay but not taxed."}
        </p>

        {/* Existing benefits */}
        {isLoading ? (
          <p className="py-4 text-center text-sm text-slate-400">Loading…</p>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-sm text-slate-500">No benefits yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((it) => (
              <li key={it.id} className="py-2.5">
                {editId === it.id ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[9rem] flex-1">
                      <label className={labelCls}>Name</label>
                      <input className={inputCls} value={ed.label} onChange={(e) => setEd((s) => ({ ...s, label: e.target.value }))} />
                    </div>
                    <div className="w-24">
                      <label className={labelCls}>Amount</label>
                      <input type="number" min="0" step="0.01" className={inputCls} value={ed.amount} onChange={(e) => setEd((s) => ({ ...s, amount: e.target.value }))} />
                    </div>
                    <div className="w-40">
                      <label className={labelCls}>How paid</label>
                      <SearchSelect className={inputCls} value={ed.cadence} onChange={(v) => setEd((s) => ({ ...s, cadence: v as PayItemCadence }))} options={PAY_ITEM_CADENCES.map((c) => ({ value: c.value, label: c.label }))} />
                    </div>
                    <div className="w-36">
                      <label className={labelCls}>Tax</label>
                      <SearchSelect className={inputCls} value={ed.taxable ? "1" : "0"} onChange={(v) => setEd((s) => ({ ...s, taxable: v === "1" }))} options={taxOptions} />
                    </div>
                    <button onClick={() => update.mutate()} disabled={update.isPending || !ed.label.trim() || Number(ed.amount) <= 0}
                      className="rounded-md bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">Save</button>
                    <button onClick={() => setEditId(null)} className="rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-slate-800">{it.label}</span>
                      <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">{peso(it.amount)}</span>
                      <span className="ml-2 text-xs text-slate-400">{cadenceLabel(it.cadence)}</span>
                      <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${it.taxable ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                        {it.taxable ? "Taxable" : "Non-taxable"}
                      </span>
                      {!it.is_active && <span className="ml-2 text-xs text-rose-500">paused</span>}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <button onClick={() => startEdit(it)} className="text-xs font-medium text-brand-700 hover:underline">Edit</button>
                      <button onClick={() => remove.mutate(it.id)} disabled={remove.isPending} className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50">Remove</button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
