"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppButton, AppCard, PageHeader, TableShell } from "@/components/ui";
import { RoleGate, HR_ROLES } from "@/components/RoleGate";
import { holidaysApi, type Holiday, type HolidayInput } from "@/lib/attendance";

import { inputCls, labelCls } from "@/lib/form-classes";

const TYPE_LABELS: Record<Holiday["type"], string> = {
  regular: "Regular",
  special_non_working: "Special (non-working)",
  special_working: "Special (working)",
  local: "Local",
};

export default function HolidaysPage() {
  return (
    <RoleGate roles={HR_ROLES}>
      <HolidaysPageInner />
    </RoleGate>
  );
}

function HolidaysPageInner() {
  const qc = useQueryClient();
  const key = ["holidays"];
  const { data: items = [] } = useQuery({ queryKey: key, queryFn: () => holidaysApi.list() });

  const emptyForm: HolidayInput = { holiday_date: "", name: "", type: "regular" };
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<HolidayInput>(emptyForm);

  const closeForm = () => {
    setForm(emptyForm);
    setIsAdding(false);
    setEditingId(null);
  };

  const save = useMutation({
    mutationFn: () =>
      editingId === null ? holidaysApi.create(form) : holidaysApi.update(editingId, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      closeForm();
    },
    meta: { successMessage: "Holiday saved." },
  });
  const remove = useMutation({
    mutationFn: (id: number) => holidaysApi.destroy(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    meta: { successMessage: "Holiday removed." },
  });

  const startEdit = (h: Holiday) => {
    setEditingId(h.id);
    setIsAdding(true);
    setForm({
      holiday_date: h.holiday_date,
      name: h.name,
      type: h.type,
      applicable_branch_id: h.applicable_branch_id,
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Holidays"
        description={`${items.length} holiday${items.length === 1 ? "" : "s"}. Used by the DTR engine to flag holiday days.`}
        actions={
          <AppButton
            variant={isAdding ? "secondary" : "primary"}
            onClick={() => (isAdding ? closeForm() : setIsAdding(true))}
          >
            {isAdding ? "Cancel" : "+ Add holiday"}
          </AppButton>
        }
      />

      {isAdding && (
        <AppCard title={editingId === null ? "Add a holiday" : "Edit holiday"}>
          <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Date *</label>
              <input type="date" className={inputCls} value={form.holiday_date} onChange={(e) => setForm({ ...form, holiday_date: e.target.value })} required />
            </div>
            <div>
              <label className={labelCls}>Name *</label>
              <input className={inputCls} placeholder="e.g. New Year's Day" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label className={labelCls}>Type</label>
              <select className={inputCls} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Holiday["type"] })}>
                {Object.entries(TYPE_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
              </select>
            </div>
            <div className="flex justify-end gap-2 sm:col-span-3">
              <AppButton type="button" variant="secondary" onClick={closeForm}>Cancel</AppButton>
              <AppButton type="submit" disabled={save.isPending}>
                {save.isPending ? "Saving…" : editingId === null ? "Add holiday" : "Save changes"}
              </AppButton>
            </div>
          </form>
        </AppCard>
      )}

      <TableShell>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Date</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Name</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Type</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-16 text-center">
                  <p className="text-sm font-medium text-slate-700">No holidays yet</p>
                  <p className="mt-1 text-sm text-slate-500">Add one to have the DTR engine flag it.</p>
                </td>
              </tr>
            )}
            {items.map((h) => (
              <tr key={h.id} className="border-t border-slate-100 transition hover:bg-slate-50/70">
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{h.holiday_date}</td>
                <td className="px-4 py-3 font-medium text-slate-800">{h.name}</td>
                <td className="px-4 py-3 text-slate-600">{TYPE_LABELS[h.type]}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => startEdit(h)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100">
                      Edit
                    </button>
                    <button onClick={() => remove.mutate(h.id)} className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100">
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}
