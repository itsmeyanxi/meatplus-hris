"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { inputCls } from "@/components/employees/ChildList";
import { ROLE_LABELS, usersApi, type Role, type UpdateUserInput } from "@/lib/users";

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const userId = Number(params.id);

  const { data: user, isLoading } = useQuery({
    queryKey: ["user", userId],
    queryFn: () => usersApi.get(userId),
    enabled: !!userId,
  });

  const [form, setForm] = useState<UpdateUserInput>({});
  const [tempPw, setTempPw] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (user) {
      setForm({ name: user.name, email: user.email, role: user.roles[0] ?? "employee", is_active: user.is_active });
    }
  }, [user]);

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
  const destroy = useMutation({
    mutationFn: () => usersApi.destroy(userId),
    onSuccess: () => router.push("/users"),
  });

  if (isLoading || !user) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/users" className="text-xs text-slate-500 hover:underline">← Users</Link>
        <h2 className="mt-1 text-2xl font-semibold">{user.name}</h2>
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
          <label className="mb-1 block text-xs font-medium text-slate-600">Role</label>
          <select className={inputCls} value={form.role ?? user.roles[0]} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_active ?? user.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            Active
          </label>
        </div>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {saved && !error && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">Saved.</p>}
        <div className="flex justify-end">
          <button type="submit" disabled={update.isPending} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
            {update.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>

      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <h3 className="text-sm font-semibold">Actions</h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { if (confirm("Generate a new temporary password? The user's current password will stop working.")) reset.mutate(); }}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100"
          >
            Reset password
          </button>
          <button
            onClick={() => { if (confirm(`Deactivate ${user.name}? They will no longer be able to log in.`)) destroy.mutate(); }}
            className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Deactivate user
          </button>
        </div>
      </section>
    </div>
  );
}
