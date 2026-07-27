"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, AppButton, AppCard, TableShell } from "@/components/ui";
import { EmployeeSearchSelect } from "@/components/EmployeeSearchSelect";
import { SearchSelect } from "@/components/SearchSelect";
import { getMe } from "@/lib/auth";
import { loansApi, peso, LOAN_TYPES, type LoanInput } from "@/lib/payroll";
import { inputCls, labelCls } from "@/lib/form-classes";

const typeLabel = (v: string) => LOAN_TYPES.find((t) => t.value === v)?.label ?? v;

export default function LoansPage() {
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const canManage = me?.user.permissions?.includes("payroll.run") ?? false;

  const [activeOnly, setActiveOnly] = useState(true);
  const { data: loans = [], isLoading } = useQuery({
    queryKey: ["loans", { activeOnly }],
    queryFn: () => loansApi.list({ active_only: activeOnly }),
  });

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<LoanInput>({ employee_id: 0, type: "cash_advance", amortization: 0, principal: undefined, reference_no: "" });

  const reset = () => { setForm({ employee_id: 0, type: "cash_advance", amortization: 0, principal: undefined, reference_no: "" }); setAdding(false); };
  const invalidate = () => qc.invalidateQueries({ queryKey: ["loans"] });

  const create = useMutation({
    mutationFn: () => loansApi.create(form),
    onSuccess: () => { toast.success("Loan added."); reset(); invalidate(); },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } };
      toast.error(err?.response?.data?.errors ? Object.values(err.response.data.errors).flat().join(" ") : err?.response?.data?.message ?? "Failed.");
    },
  });
  const toggle = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) => loansApi.update(id, { is_active }),
    onSuccess: () => invalidate(),
  });
  const remove = useMutation({
    mutationFn: (id: number) => loansApi.remove(id),
    onSuccess: () => { toast.success("Loan deleted."); invalidate(); },
  });

  const canSubmit = form.employee_id > 0 && form.type && Number(form.amortization) > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Loans & Deductions"
        description="Recurring amortized deductions (SSS/Pag-IBIG loans, cash advances, company loans). Each cutoff deducts the amortization; the balance draws down when a run is posted."
        actions={canManage ? (
          <AppButton variant={adding ? "secondary" : "primary"} onClick={() => (adding ? reset() : setAdding(true))}>
            {adding ? "Cancel" : "+ New loan"}
          </AppButton>
        ) : undefined}
      />

      {adding && canManage && (
        <AppCard title="New loan / deduction">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <label className={labelCls}>Employee *</label>
              <EmployeeSearchSelect className={inputCls} value={form.employee_id || ""} onChange={(id) => setForm({ ...form, employee_id: id === "" ? 0 : Number(id) })} placeholder="Search…" />
            </div>
            <div>
              <label className={labelCls}>Type *</label>
              <SearchSelect className={inputCls} value={form.type} onChange={(v) => setForm({ ...form, type: v })} options={LOAN_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
            </div>
            <div>
              <label className={labelCls}>Reference no.</label>
              <input className={inputCls} value={form.reference_no ?? ""} onChange={(e) => setForm({ ...form, reference_no: e.target.value })} placeholder="optional" />
            </div>
            <div>
              <label className={labelCls}>Principal / total</label>
              <input type="number" min="0" step="0.01" className={inputCls} value={form.principal ?? ""} onChange={(e) => setForm({ ...form, principal: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder="0.00" />
            </div>
            <div>
              <label className={labelCls}>Amortization / cutoff *</label>
              <input type="number" min="0" step="0.01" className={inputCls} value={form.amortization || ""} onChange={(e) => setForm({ ...form, amortization: Number(e.target.value) })} placeholder="0.00" />
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-400">Outstanding balance defaults to the principal. It reduces automatically each time a payroll run that deducted it is posted.</p>
          <div className="mt-3 flex justify-end">
            <AppButton onClick={() => create.mutate()} disabled={!canSubmit || create.isPending}>{create.isPending ? "Saving…" : "Add loan"}</AppButton>
          </div>
        </AppCard>
      )}

      <div className="flex items-center gap-2">
        <button onClick={() => setActiveOnly(true)} className={activeOnly ? pillOn : pillOff}>Active</button>
        <button onClick={() => setActiveOnly(false)} className={!activeOnly ? pillOn : pillOff}>All</button>
      </div>

      <TableShell>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3 text-right">Amortization</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-4 py-3 text-center">Status</th>
                {canManage && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (<tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">Loading…</td></tr>)}
              {!isLoading && loans.length === 0 && (<tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">No loans.</td></tr>)}
              {loans.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-800">{l.employee?.name ?? "—"}</div>
                    <div className="font-mono text-xs text-slate-400">{l.employee?.employee_no}</div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{typeLabel(l.type)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{l.reference_no ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{peso(l.amortization)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{peso(l.outstanding_balance)}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${l.is_active && l.outstanding_balance > 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {l.outstanding_balance <= 0 ? "Paid" : l.is_active ? "Active" : "Paused"}
                    </span>
                  </td>
                  {canManage && (
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-2">
                        {l.outstanding_balance > 0 && (
                          <button onClick={() => toggle.mutate({ id: l.id, is_active: !l.is_active })} className="text-xs font-medium text-slate-600 hover:underline">
                            {l.is_active ? "Pause" : "Resume"}
                          </button>
                        )}
                        <button onClick={() => remove.mutate(l.id)} className="text-xs font-medium text-rose-600 hover:underline">Delete</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TableShell>
    </div>
  );
}

const pillOn = "rounded-full bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm";
const pillOff = "rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50";
