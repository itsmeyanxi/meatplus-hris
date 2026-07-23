"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { inputCls } from "@/components/employees/ChildList";
import { SearchSelect } from "@/components/SearchSelect";
import { PasswordField, isPasswordValid } from "@/components/PasswordField";
import { ROLE_LABELS, usersApi, type Role, type StoreUserInput } from "@/lib/users";

export default function NewUserPage() {
  const router = useRouter();
  const [form, setForm] = useState<StoreUserInput>({
    name: "",
    email: "",
    password: "",
    role: "hr_admin",
  });
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => usersApi.create(form),
    onSuccess: (u) => router.push(`/users/${u.id}`),
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } };
      const msgs = err?.response?.data?.errors;
      setError(msgs ? Object.values(msgs).flat().join(" ") : err?.response?.data?.message ?? "Failed to create user");
    },
  });

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">New direct user</h2>
        <p className="text-sm text-slate-500">
          For admin-type users (HR, payroll officer) who are NOT regular employees. To give a regular employee a login, open their employee profile instead — the <strong>Provision login</strong> button is more appropriate.
        </p>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); setError(null); create.mutate(); }}
        className="rounded-xl border border-slate-200 bg-white p-5 space-y-4"
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Full name *</label>
          <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Email *</label>
          <input type="email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </div>
        <PasswordField
          label="Initial password"
          value={form.password}
          onChange={(v) => setForm({ ...form, password: v })}
        />
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Role *</label>
          <SearchSelect
            className={inputCls}
            value={form.role}
            onChange={(v) => setForm({ ...form, role: v as Role })}
            options={Object.entries(ROLE_LABELS).map(([k, v]) => ({ value: k, label: v }))}
          />
        </div>

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => router.back()} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100">Cancel</button>
          <button type="submit" disabled={create.isPending || !isPasswordValid(form.password)} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
            {create.isPending ? "Creating…" : "Create user"}
          </button>
        </div>
      </form>
    </div>
  );
}
