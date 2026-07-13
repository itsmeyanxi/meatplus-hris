"use client";

import { useState } from "react";
import { AppButton, TableShell } from "@/components/ui";
import { inputCls, labelCls } from "@/lib/form-classes";

// UI shell only — training records are held in local state for preview.
// Persisting them (a backend table + API) is a later pass.

type Training = {
  id: number;
  training_date: string;
  name: string;
  instructor: string;
  nature: string;
  cost: string;
  returning_service_period: string;
  corresponding_amount: string;
  notes: string;
  start: string;
  end: string;
};

const COLS = [
  "Training Date",
  "Training Name",
  "Instructor / Institution",
  "Nature of Training",
  "Training Cost",
  "Returning Service Period",
  "Corresponding Amount",
  "Training Notes",
  "Start of Training",
  "End of Training",
];

export function TrainingSection() {
  const [rows, setRows] = useState<Training[]>([]);
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-2.5 text-xs text-amber-800">
        Preview only — training records aren&apos;t saved to the server yet.
      </div>

      <div>
        <AppButton onClick={() => setShowForm(true)}>+ Add Training</AppButton>
      </div>

      <TableShell>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-sm">
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
                    No training records yet. Use “Add Training” to record one.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{r.training_date || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-800">{r.name}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{r.instructor || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{r.nature || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{r.cost || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{r.returning_service_period || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{r.corresponding_amount || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{r.notes || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{r.start || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{r.end || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </TableShell>

      {showForm && (
        <AddTrainingModal
          onClose={() => setShowForm(false)}
          onAdd={(t) => {
            setRows((prev) => [...prev, { ...t, id: Date.now() }]);
            setShowForm(false);
          }}
        />
      )}
    </div>
  );
}

function AddTrainingModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (t: Omit<Training, "id">) => void;
}) {
  const [f, setF] = useState<Omit<Training, "id">>({
    training_date: "",
    name: "",
    instructor: "",
    nature: "",
    cost: "",
    returning_service_period: "",
    corresponding_amount: "",
    notes: "",
    start: "",
    end: "",
  });
  const set = (k: keyof Omit<Training, "id">, v: string) => setF((s) => ({ ...s, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">Add Training</h2>

        <div className="mt-4 space-y-4">
          <div>
            <label className={labelCls}>Training Name</label>
            <input className={inputCls} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Food Safety Seminar" />
          </div>
          <div>
            <label className={labelCls}>Instructor / Institution</label>
            <input className={inputCls} value={f.instructor} onChange={(e) => set("instructor", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Training Date</label>
              <input className={inputCls} type="date" value={f.training_date} onChange={(e) => set("training_date", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Nature of Training</label>
              <input className={inputCls} value={f.nature} onChange={(e) => set("nature", e.target.value)} placeholder="Internal / External" />
            </div>
            <div>
              <label className={labelCls}>Start of Training</label>
              <input className={inputCls} type="date" value={f.start} onChange={(e) => set("start", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>End of Training</label>
              <input className={inputCls} type="date" value={f.end} onChange={(e) => set("end", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Training Cost</label>
              <input className={inputCls} type="number" min={0} step="0.01" value={f.cost} onChange={(e) => set("cost", e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className={labelCls}>Corresponding Amount</label>
              <input className={inputCls} type="number" min={0} step="0.01" value={f.corresponding_amount} onChange={(e) => set("corresponding_amount", e.target.value)} placeholder="0.00" />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Returning Service Period</label>
              <input className={inputCls} value={f.returning_service_period} onChange={(e) => set("returning_service_period", e.target.value)} placeholder="e.g. 12 months" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Training Notes</label>
            <input className={inputCls} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <AppButton type="button" variant="secondary" onClick={onClose}>Cancel</AppButton>
          <AppButton type="button" onClick={() => onAdd(f)} disabled={!f.name.trim()}>Add</AppButton>
        </div>
      </div>
    </div>
  );
}
