"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppButton, TableShell } from "@/components/ui";
import { inputCls, labelCls } from "@/lib/form-classes";
import { assetsApi, type Asset, type AssetInput } from "@/lib/employee-relations";

const COLS = [
  "Item",
  "Category",
  "Condition",
  "Purchase Price",
  "Serial Number",
  "Acquired Date",
  "Date Issued",
  "Date Returned",
  "Notes",
];

const CONDITIONS = ["New", "Good", "Fair", "Damaged", "For Repair"];

export function AssetsSection({ employeeId }: { employeeId: number }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const key = ["employee", employeeId, "assets"];
  const { data: rows, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => assetsApi.list(employeeId),
    enabled: !!employeeId,
  });

  const create = useMutation({
    mutationFn: (body: AssetInput) => assetsApi.create(employeeId, body),
    onSuccess: () => {
      toast.success("Asset added.");
      qc.invalidateQueries({ queryKey: key });
      setShowForm(false);
    },
    onError: () => toast.error("Could not add the asset."),
  });

  const destroy = useMutation({
    mutationFn: (id: number) => assetsApi.destroy(employeeId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: () => toast.error("Could not remove the asset."),
  });

  return (
    <div className="space-y-4">
      <div>
        <AppButton onClick={() => setShowForm(true)}>+ Add Assets</AppButton>
      </div>

      <TableShell>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1150px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                {COLS.map((c) => (
                  <th key={c} className="whitespace-nowrap px-4 py-3">{c}</th>
                ))}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={COLS.length + 1} className="px-4 py-8 text-center text-xs text-slate-400">Loading…</td></tr>
              ) : (rows?.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={COLS.length + 1} className="px-4 py-8 text-center text-xs text-slate-400">
                    No assets yet. Use “Add Assets” to record one.
                  </td>
                </tr>
              ) : (
                rows!.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-800">{r.item}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{r.category || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{r.condition || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{r.purchase_price ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-slate-600">{r.serial_number || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{r.acquired_date || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{r.date_issued || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{r.date_returned || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{r.notes || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => destroy.mutate(r.id)}
                        disabled={destroy.isPending}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-red-600 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </TableShell>

      {showForm && (
        <AddAssetModal
          saving={create.isPending}
          onClose={() => setShowForm(false)}
          onAdd={(a) => create.mutate(a)}
        />
      )}
    </div>
  );
}

function AddAssetModal({
  saving,
  onClose,
  onAdd,
}: {
  saving: boolean;
  onClose: () => void;
  onAdd: (a: AssetInput) => void;
}) {
  const [f, setF] = useState({
    item: "",
    category: "",
    condition: CONDITIONS[0],
    purchase_price: "",
    serial_number: "",
    acquired_date: "",
    date_issued: "",
    date_returned: "",
    notes: "",
  });
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));

  const submit = () =>
    onAdd({
      item: f.item.trim(),
      category: f.category || null,
      condition: f.condition || null,
      purchase_price: f.purchase_price ? Number(f.purchase_price) : null,
      serial_number: f.serial_number || null,
      acquired_date: f.acquired_date || null,
      date_issued: f.date_issued || null,
      date_returned: f.date_returned || null,
      notes: f.notes || null,
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">Add Assets</h2>

        <div className="mt-4 space-y-4">
          <div>
            <label className={labelCls}>Item</label>
            <input className={inputCls} value={f.item} onChange={(e) => set("item", e.target.value)} placeholder="e.g. Laptop" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Category</label>
              <input className={inputCls} value={f.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. IT Equipment" />
            </div>
            <div>
              <label className={labelCls}>Condition</label>
              <select className={inputCls} value={f.condition} onChange={(e) => set("condition", e.target.value)}>
                {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Purchase Price</label>
              <input className={inputCls} type="number" min={0} step="0.01" value={f.purchase_price} onChange={(e) => set("purchase_price", e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className={labelCls}>Serial Number</label>
              <input className={inputCls} value={f.serial_number} onChange={(e) => set("serial_number", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Acquired Date</label>
              <input className={inputCls} type="date" value={f.acquired_date} onChange={(e) => set("acquired_date", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Date Issued</label>
              <input className={inputCls} type="date" value={f.date_issued} onChange={(e) => set("date_issued", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Date Returned</label>
              <input className={inputCls} type="date" value={f.date_returned} onChange={(e) => set("date_returned", e.target.value)} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Notes</label>
            <input className={inputCls} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <AppButton type="button" variant="secondary" onClick={onClose}>Cancel</AppButton>
          <AppButton type="button" onClick={submit} disabled={!f.item.trim() || saving}>{saving ? "Adding…" : "Add"}</AppButton>
        </div>
      </div>
    </div>
  );
}

export type { Asset };
