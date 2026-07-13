"use client";

import { useState } from "react";
import { AppButton, TableShell } from "@/components/ui";
import { inputCls, labelCls } from "@/lib/form-classes";

// UI shell only — assets are held in local state for preview. Persisting them
// (a backend table + API) is a later pass.

type Asset = {
  id: number;
  item: string;
  category: string;
  condition: string;
  purchase_price: string;
  serial_number: string;
  acquired_date: string;
  date_issued: string;
  date_returned: string;
  notes: string;
};

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

export function AssetsSection() {
  const [rows, setRows] = useState<Asset[]>([]);
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-2.5 text-xs text-amber-800">
        Preview only — assets aren&apos;t saved to the server yet.
      </div>

      <div>
        <AppButton onClick={() => setShowForm(true)}>+ Add Assets</AppButton>
      </div>

      <TableShell>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
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
                    No assets yet. Use “Add Assets” to record one.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-800">{r.item}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{r.category || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{r.condition || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{r.purchase_price || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-slate-600">{r.serial_number || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{r.acquired_date || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{r.date_issued || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{r.date_returned || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{r.notes || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </TableShell>

      {showForm && (
        <AddAssetModal
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

function AddAssetModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (a: Omit<Asset, "id">) => void;
}) {
  const [f, setF] = useState<Omit<Asset, "id">>({
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
  const set = (k: keyof Omit<Asset, "id">, v: string) => setF((s) => ({ ...s, [k]: v }));

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
          <AppButton type="button" onClick={() => onAdd(f)} disabled={!f.item.trim()}>Add</AppButton>
        </div>
      </div>
    </div>
  );
}
