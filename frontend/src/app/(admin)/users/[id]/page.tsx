"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { inputCls } from "@/components/employees/ChildList";
import { useConfirm } from "@/components/ConfirmDialog";
import { ROLE_LABELS, usersApi, type Role, type UpdateUserInput } from "@/lib/users";
import { getCompanies } from "@/lib/companies";

// Roles that may legitimately handle more than one company (HR + timekeeping).
const MULTI_COMPANY_ROLES: Role[] = ["hr_admin", "hr_officer", "hr_coordinator", "timekeeper"];

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const userId = Number(params.id);

  const { data: user, isLoading } = useQuery({
    queryKey: ["user", userId],
    queryFn: () => usersApi.get(userId),
    enabled: !!userId,
  });
  const { data: companies = [] } = useQuery({ queryKey: ["companies-list"], queryFn: getCompanies, staleTime: 60_000 });

  const [form, setForm] = useState<UpdateUserInput>({});
  const [tempPw, setTempPw] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Hydrate the form once the user loads (guarded render-time sync rather than an
  // effect, so a background refetch never clobbers in-progress edits).
  const [hydrated, setHydrated] = useState(false);
  if (user && !hydrated) {
    setHydrated(true);
    setForm({ name: user.name, email: user.email, roles: user.roles, is_active: user.is_active });
  }

  const update = useMutation({
    mutationFn: () => usersApi.update(userId, form),
    onSuccess: () => {
      setError(null);
      setSaved(true);
      qc.invalidateQueries({ queryKey: ["user", userId] });
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } };
      const msgs = err?.response?.data?.errors;
      setError(msgs ? Object.values(msgs).flat().join(" ") : err?.response?.data?.message ?? "Failed to save");
    },
  });
  const reset = useMutation({
    mutationFn: () => usersApi.resetPassword(userId),
    onSuccess: (d) => setTempPw(d.temporary_password),
  });
  const deactivate = useMutation({
    mutationFn: () => usersApi.deactivate(userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user", userId] });
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
  const activate = useMutation({
    mutationFn: () => usersApi.activate(userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user", userId] });
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
  const destroy = useMutation({
    mutationFn: () => usersApi.destroy(userId),
    onSuccess: () => router.push("/users"),
  });

  if (isLoading || !user) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="max-w-2xl space-y-6">
      {dialog}
      <div>
        <Link href="/users" className="text-xs text-slate-500 hover:underline">← Users</Link>
        <div className="mt-1 flex items-center gap-3">
          <h2 className="text-2xl font-semibold">{user.name}</h2>
          {user.is_active ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />Inactive
            </span>
          )}
        </div>
        <p className="text-sm text-slate-500">
          {user.email}{user.employee && <> · linked to <Link href={`/employees/${user.employee.id}`} className="underline">{user.employee.full_name}</Link></>}
        </p>
      </div>

      {tempPw && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">New temporary password (shown ONCE):</p>
          <p className="mt-1 font-mono text-lg text-amber-900">{tempPw}</p>
          <button onClick={() => setTempPw(null)} className="mt-2 text-xs text-amber-800 underline">Dismiss</button>
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); setError(null); setSaved(false); update.mutate(); }}
        className="rounded-xl border border-slate-200 bg-white p-5 space-y-4"
      >
        <h3 className="text-sm font-semibold">Profile</h3>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Name</label>
          <input className={inputCls} value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
          <input type="email" className={inputCls} value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Roles</label>
          {user.suggested_role && user.employee?.position && (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
              <span className="text-amber-800">
                Suggested from position <span className="font-medium">&ldquo;{user.employee.position}&rdquo;</span>:{" "}
                <span className="font-semibold">{ROLE_LABELS[user.suggested_role]}</span>
              </span>
              {(form.roles ?? user.roles).includes(user.suggested_role) ? (
                <span className="shrink-0 font-medium text-emerald-700">✓ applied</span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const role = user.suggested_role!;
                    const current = form.roles ?? user.roles;
                    if (!current.includes(role)) setForm({ ...form, roles: [...current, role] });
                  }}
                  className="shrink-0 rounded-md bg-amber-600 px-2.5 py-1 font-medium text-white hover:bg-amber-700"
                >
                  Apply
                </button>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            {(Object.entries(ROLE_LABELS) as [Role, string][]).map(([key, label]) => {
              const checked = (form.roles ?? user.roles).includes(key);
              return (
                <label key={key} className={`flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition ${checked ? "bg-brand-600 text-white border-brand-600" : "bg-white text-slate-700 hover:bg-slate-100 border-slate-200"} border`}>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={() => {
                      const current = form.roles ?? user.roles;
                      setForm({
                        ...form,
                        roles: checked
                          ? current.filter((r) => r !== key)
                          : [...current, key],
                      });
                    }}
                  />
                  <span className={`h-3.5 w-3.5 shrink-0 rounded border ${checked ? "border-white bg-white" : "border-slate-300 bg-white"} flex items-center justify-center`}>
                    {checked && <svg className="h-2.5 w-2.5 text-slate-900" viewBox="0 0 12 12" fill="currentColor"><path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>}
                  </span>
                  {label}
                </label>
              );
            })}
          </div>
          {(form.roles ?? user.roles).length === 0 && (
            <p className="mt-1 text-xs text-red-600">At least one role is required.</p>
          )}
        </div>

        {/* Companies — shown for HR / timekeeping staff who may handle more than one company. */}
        {(form.roles ?? user.roles).some((r) => MULTI_COMPANY_ROLES.includes(r)) && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Companies this user can access</label>
            <p className="mb-2 text-xs text-slate-400">Tick every company this user handles — they can switch between the ones selected here.</p>
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              {companies.map((c) => {
                const selected = form.company_ids ?? user.companies?.map((x) => x.id) ?? [];
                const checked = selected.includes(c.id);
                return (
                  <label key={c.id} className={`flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition ${checked ? "bg-brand-600 text-white border-brand-600" : "bg-white text-slate-700 hover:bg-slate-100 border-slate-200"} border`}>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      onChange={() => {
                        const cur = form.company_ids ?? user.companies?.map((x) => x.id) ?? [];
                        setForm({ ...form, company_ids: checked ? cur.filter((id) => id !== c.id) : [...cur, c.id] });
                      }}
                    />
                    <span className={`h-3.5 w-3.5 shrink-0 rounded border ${checked ? "border-white bg-white" : "border-slate-300 bg-white"} flex items-center justify-center`}>
                      {checked && <svg className="h-2.5 w-2.5 text-slate-900" viewBox="0 0 12 12" fill="currentColor"><path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>}
                    </span>
                    {c.code ?? c.legal_name}
                  </label>
                );
              })}
            </div>
            {(form.company_ids ?? user.companies?.map((x) => x.id) ?? []).length === 0 && (
              <p className="mt-1 text-xs text-amber-600">Pick at least one company, or this user won&apos;t have access anywhere.</p>
            )}
          </div>
        )}

        <div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_active ?? user.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            Active
          </label>
        </div>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {saved && !error && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">Saved.</p>}
        <div className="flex justify-end">
          <button type="submit" disabled={update.isPending || (form.roles ?? user.roles).length === 0} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
            {update.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>

      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <h3 className="text-sm font-semibold">Actions</h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={async () => { if (await confirm({ title: "Reset password", message: "Generate a new temporary password? The user's current password will stop working.", confirmLabel: "Reset password" })) reset.mutate(); }}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100"
          >
            Reset password
          </button>
          {user.is_active ? (
            <button
              disabled={deactivate.isPending}
              onClick={async () => { if (await confirm({ title: "Deactivate user", message: `Deactivate ${user.name}? They will no longer be able to log in.`, confirmLabel: "Deactivate", danger: true })) deactivate.mutate(); }}
              className="rounded-md border border-amber-300 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-60"
            >
              {deactivate.isPending ? "Deactivating…" : "Deactivate user"}
            </button>
          ) : (
            <button
              disabled={activate.isPending}
              onClick={async () => { if (await confirm({ title: "Re-activate user", message: `Re-activate ${user.name}? They will be able to log in again.`, confirmLabel: "Re-activate" })) activate.mutate(); }}
              className="rounded-md border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
            >
              {activate.isPending ? "Activating…" : "Re-activate user"}
            </button>
          )}
          <button
            disabled={destroy.isPending}
            onClick={async () => { if (await confirm({ title: "Delete user permanently", message: `Permanently delete ${user.name}? This cannot be undone.`, confirmLabel: "Delete permanently", danger: true })) destroy.mutate(); }}
            className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
          >
            {destroy.isPending ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </section>
    </div>
  );
}
