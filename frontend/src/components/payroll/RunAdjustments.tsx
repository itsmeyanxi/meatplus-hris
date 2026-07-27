"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppCard } from "@/components/ui";
import { EmployeeSearchSelect } from "@/components/EmployeeSearchSelect";
import { SearchSelect } from "@/components/SearchSelect";
import { adjustmentsApi, peso } from "@/lib/payroll";
import { inputCls, labelCls } from "@/lib/form-classes";

/**
 * One-off earnings/deductions for a payroll run (bonus, backpay, uniform…).
 * Editable while the run is draft/computed; changes take effect on the next Compute.
 */
export function RunAdjustments({ runId, editable, onChanged }: { runId: number; editable: boolean; onChanged: () => void }) {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: ["run-adjustments", runId],
    queryFn: () => adjustmentsApi.list(runId),
  });

  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState<number | "">("");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<"earning" | "deduction">("earning");
  const [amount, setAmount] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["run-adjustments", runId] });
    onChanged();
  };
  const add = useMutation({
    mutationFn: () => adjustmentsApi.create(runId, { employee_id: Number(employeeId), label, kind, amount: Number(amount) }),
    onSuccess: () => {
      toast.success("Adjustment added — press Compute to apply it.");
      setEmployeeId(""); setLabel(""); setAmount(""); setKind("earning"); setOpen(false);
      invalidate();
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } };
      toast.error(err?.response?.data?.errors ? Object.values(err.response.data.errors).flat().join(" ") : err?.response?.data?.message ?? "Failed to add.");
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => adjustmentsApi.remove(id),
    onSuccess: () => { toast.success("Removed — press Compute to apply."); invalidate(); },
  });

  const canSubmit = employeeId !== "" && label.trim() && Number(amount) > 0;

  if (!editable && items.length === 0) return null;

  return (
    <AppCard title="Adjustments" description="One-off earnings or deductions for this run (bonus, backpay, uniform). Applied on the next Compute.">
      {editable && (
        <div className="mb-3 flex justify-end">
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
          >
            {open ? "Cancel" : "+ Add adjustment"}
          </button>
        </div>
      )}
      {open && editable && (
        <div className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <label className={labelCls}>Employee</label>
            <EmployeeSearchSelect className={inputCls} value={employeeId} onChange={(id) => setEmployeeId(id === "" ? "" : Number(id))} placeholder="Search…" />
          </div>
          <div>
            <label className={labelCls}>Label</label>
            <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Performance bonus" />
          </div>
          <div>
            <label className={labelCls}>Type</label>
            <SearchSelect
              className={inputCls}
              value={kind}
              onChange={(v) => setKind(v as "earning" | "deduction")}
              options={[{ value: "earning", label: "Earning (+)" }, { value: "deduction", label: "Deduction (−)" }]}
            />
          </div>
          <div>
            <label className={labelCls}>Amount</label>
            <div className="flex gap-2">
              <input type="number" min="0" step="0.01" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              <button
                onClick={() => add.mutate()}
                disabled={!canSubmit || add.isPending}
                className="shrink-0 rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-slate-400">No adjustments on this run.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-2.5">
              <div>
                <span className="text-sm font-medium text-slate-800">{a.employee?.name ?? "—"}</span>
                <span className="ml-2 text-sm text-slate-500">{a.label}</span>
                <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${a.kind === "earning" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                  {a.kind === "earning" ? "+" : "−"}{peso(a.amount)}
                </span>
              </div>
              {editable && (
                <button onClick={() => remove.mutate(a.id)} disabled={remove.isPending} className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50">
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </AppCard>
  );
}
