"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { TableShell } from "@/components/ui";
import { leaveTypesApi, LeaveType, LeaveTypeInput } from "@/lib/leaves";
import { inputCls, labelCls } from "@/lib/form-classes";

const EMPTY_FORM: LeaveTypeInput = {
  code: "",
  name: "",
  default_credits_per_year: 0,
  is_paid: true,
  requires_attachment: false,
};

type FormState = { mode: "add" } | { mode: "edit"; id: number } | null;

export function TypesTab() {
  const qc = useQueryClient();
  const [formState, setFormState] = useState<FormState>(null);
  const [form, setForm] = useState<LeaveTypeInput>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const { data: types = [] } = useQuery({
    queryKey: ["leave-types"],
    queryFn: leaveTypesApi.list,
  });

  const createMutation = useMutation({
    mutationFn: (body: LeaveTypeInput) => leaveTypesApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-types"] });
      closeForm();
    },
    onError: (err: unknown) => {
      const msg = extractErrorMessage(err);
      setError(msg);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: LeaveTypeInput }) =>
      leaveTypesApi.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-types"] });
      closeForm();
    },
    onError: (err: unknown) => {
      const msg = extractErrorMessage(err);
      setError(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => leaveTypesApi.destroy(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-types"] });
    },
    onError: (err: unknown) => {
      const msg = extractErrorMessage(err);
      alert(msg);
    },
  });

  function openAdd() {
    setForm(EMPTY_FORM);
    setError(null);
    setFormState({ mode: "add" });
  }

  function openEdit(t: LeaveType) {
    setForm({
      code: t.code,
      name: t.name,
      default_credits_per_year: Number(t.default_credits_per_year),
      is_paid: t.is_paid,
      requires_attachment: t.requires_attachment,
    });
    setError(null);
    setFormState({ mode: "edit", id: t.id });
  }

  function closeForm() {
    setFormState(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  function handleDelete(t: LeaveType) {
    if (!window.confirm(`Delete leave type "${t.name}"? This cannot be undone.`)) return;
    deleteMutation.mutate(t.id);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (formState?.mode === "edit") {
      updateMutation.mutate({ id: formState.id, body: form });
    } else {
      createMutation.mutate(form);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{types.length} leave type{types.length !== 1 ? "s" : ""}</p>
        {formState === null && (
          <button
            onClick={openAdd}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700"
          >
            + Add Leave Type
          </button>
        )}
      </div>

      {/* Inline form */}
      {formState !== null && (
        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-4"
        >
          <p className="text-sm font-semibold text-slate-800">
            {formState.mode === "add" ? "New Leave Type" : "Edit Leave Type"}
          </p>

          {error && (
            <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200">
              {error}
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Code</label>
              <input
                className={inputCls}
                required
                maxLength={20}
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="e.g. SL"
              />
            </div>
            <div>
              <label className={labelCls}>Name</label>
              <input
                className={inputCls}
                required
                maxLength={100}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Sick Leave"
              />
            </div>
            <div>
              <label className={labelCls}>Credits / Year</label>
              <input
                type="number"
                className={inputCls}
                required
                min={0}
                step="0.01"
                value={form.default_credits_per_year}
                onChange={(e) =>
                  setForm((f) => ({ ...f, default_credits_per_year: Number(e.target.value) }))
                }
              />
            </div>
            <div className="flex flex-col gap-3 pt-1 sm:pt-6">
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_paid}
                  onChange={(e) => setForm((f) => ({ ...f, is_paid: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Is Paid
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.requires_attachment}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, requires_attachment: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-slate-300"
                />
                Requires Attachment
              </label>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-md bg-green-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-green-700 disabled:opacity-60"
            >
              {isSaving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={closeForm}
              disabled={isSaving}
              className="rounded-md bg-slate-200 px-4 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-300 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      <TableShell>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Code</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Name</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Credits/yr</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Paid</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Attachment</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Gender</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Accrual</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Max consec.</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody>
            {types.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-16 text-center text-sm text-slate-500">
                  No leave types yet. Click "+ Add Leave Type" to create one.
                </td>
              </tr>
            )}
            {types.map((t) => (
              <tr key={t.id} className="border-t border-slate-100 transition hover:bg-slate-50/70">
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{t.code}</td>
                <td className="px-4 py-3 font-medium text-slate-800">{t.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">
                  {t.default_credits_per_year}
                </td>
                <td className="px-4 py-3 text-slate-600">{t.is_paid ? "Yes" : "No"}</td>
                <td className="px-4 py-3 text-slate-600">
                  {t.requires_attachment ? "Required" : "—"}
                </td>
                <td className="px-4 py-3 text-slate-600">{t.gender_restriction ?? "any"}</td>
                <td className="px-4 py-3 text-slate-600">{t.accrual_method}</td>
                <td className="px-4 py-3 text-slate-600">{t.max_consecutive_days ?? "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEdit(t)}
                      disabled={formState !== null}
                      className="rounded px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-300 transition hover:bg-slate-100 disabled:opacity-40"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(t)}
                      disabled={deleteMutation.isPending}
                      className="rounded px-2 py-1 text-xs font-medium text-red-600 ring-1 ring-red-200 transition hover:bg-red-50 disabled:opacity-40"
                    >
                      Delete
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

function extractErrorMessage(err: unknown): string {
  if (
    err != null &&
    typeof err === "object" &&
    "response" in err
  ) {
    const res = (err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } }).response;
    if (res?.data?.errors) {
      return Object.values(res.data.errors).flat().join(" ");
    }
    if (res?.data?.message) return res.data.message;
  }
  if (err instanceof Error) return err.message;
  return "An unexpected error occurred.";
}
