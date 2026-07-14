"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, AppButton, TableShell } from "@/components/ui";
import { inputCls, labelCls } from "@/lib/form-classes";
import { referenceApi, type ReferenceCategory, type ReferenceItem } from "@/lib/reference";

/**
 * Reusable master-data list manager (name + description + active) for any of the
 * reference categories. Backs the Assets / Visa / Benefits Type / Work Location
 * maintenance screens.
 */
export function ReferenceListManager({
  category,
  title,
  description,
  nameLabel = "Name",
}: {
  category: ReferenceCategory;
  title: string;
  description: string;
  nameLabel?: string;
}) {
  const qc = useQueryClient();
  const key = ["reference", category];
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ReferenceItem | null>(null);

  const { data: rows, isLoading } = useQuery({ queryKey: key, queryFn: () => referenceApi.list(category) });

  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  const save = useMutation({
    mutationFn: (body: { name: string; description: string | null; is_active: boolean }) =>
      editing
        ? referenceApi.update(category, editing.id, body)
        : referenceApi.create(category, body),
    onSuccess: () => {
      toast.success(editing ? "Updated." : "Added.");
      setShowForm(false);
      setEditing(null);
      invalidate();
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err?.response?.data?.message ?? "Could not save.");
    },
  });

  const destroy = useMutation({
    mutationFn: (id: number) => referenceApi.destroy(category, id),
    onSuccess: invalidate,
    onError: () => toast.error("Could not remove."),
  });

  const openAdd = () => { setEditing(null); setShowForm(true); };
  const openEdit = (r: ReferenceItem) => { setEditing(r); setShowForm(true); };

  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />

      <div>
        <AppButton onClick={openAdd}>+ Add {title}</AppButton>
      </div>

      <TableShell>
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-slate-50">
            <tr>
              {[nameLabel, "Description", "Status", ""].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {isLoading ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-xs text-slate-400">Loading…</td></tr>
            ) : (rows?.length ?? 0) === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-xs text-slate-400">Nothing here yet. Use “Add {title}”.</td></tr>
            ) : (
              rows!.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{r.name}</td>
                  <td className="px-4 py-2.5 text-slate-600">{r.description || "—"}</td>
                  <td className="px-4 py-2.5">
                    {r.is_active ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Active</span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">Inactive</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button type="button" onClick={() => openEdit(r)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-50">Edit</button>
                      <button type="button" onClick={() => destroy.mutate(r.id)} disabled={destroy.isPending} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-red-600 disabled:opacity-50">Remove</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableShell>

      {showForm && (
        <ItemModal
          key={editing?.id ?? "new"}
          nameLabel={nameLabel}
          initial={editing}
          saving={save.isPending}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSave={(v) => save.mutate(v)}
        />
      )}
    </div>
  );
}

function ItemModal({
  nameLabel,
  initial,
  saving,
  onClose,
  onSave,
}: {
  nameLabel: string;
  initial: ReferenceItem | null;
  saving: boolean;
  onClose: () => void;
  onSave: (v: { name: string; description: string | null; is_active: boolean }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [desc, setDesc] = useState(initial?.description ?? "");
  const [active, setActive] = useState(initial?.is_active ?? true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">{initial ? "Edit" : "Add"}</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className={labelCls}>{nameLabel} *</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <input className={inputCls} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <AppButton type="button" variant="secondary" onClick={onClose}>Cancel</AppButton>
          <AppButton type="button" disabled={!name.trim() || saving} onClick={() => onSave({ name: name.trim(), description: desc.trim() || null, is_active: active })}>
            {saving ? "Saving…" : "Save"}
          </AppButton>
        </div>
      </div>
    </div>
  );
}
