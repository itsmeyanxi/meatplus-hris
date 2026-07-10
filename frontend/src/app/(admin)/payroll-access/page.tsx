"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { payrollAccessApi, type PayrollAccessRow } from "@/lib/payroll";
import { usersApi } from "@/lib/users";

const ROLE_BLURB: Record<string, string> = {
  payroll_officer: "Run, approve and post payroll; manage compensation",
  it_admin: "Full administrative access across every company",
};

export default function PayrollAccessPage() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const [userId, setUserId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [role, setRole] = useState("");

  const { data: grants, isLoading } = useQuery({
    queryKey: ["payroll-access"],
    queryFn: payrollAccessApi.list,
  });
  const { data: options } = useQuery({
    queryKey: ["payroll-access", "options"],
    queryFn: payrollAccessApi.options,
  });
  const { data: users } = useQuery({
    queryKey: ["users", "active"],
    queryFn: () => usersApi.list({ only_active: true }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["payroll-access"] });

  const grant = useMutation({
    mutationFn: () =>
      payrollAccessApi.grant({
        user_id: Number(userId),
        company_id: Number(companyId),
        payroll_role: role,
      }),
    onSuccess: () => {
      setError(null);
      setUserId(""); setCompanyId(""); setRole("");
      invalidate();
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message ?? "Could not grant access.");
    },
  });

  const revoke = useMutation({
    mutationFn: (row: PayrollAccessRow) =>
      payrollAccessApi.revoke({
        user_id: row.user_id,
        company_id: row.company_id,
        payroll_role: row.payroll_role,
      }),
    onSuccess: invalidate,
    onError: () => setError("Could not revoke access."),
  });

  const canSubmit = userId && companyId && role && !grant.isPending;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Payroll User Access</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Who may work on payroll, and for which company. Leave a user off this list and they keep
          ordinary employee access only.
        </p>
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          Access is granted per company code. A user can hold payroll access in one company and none
          in another.
        </p>
      </div>

      {/* Grant form */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Add Payroll User Access
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="User">
            <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Select a user…</option>
              {users?.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
              ))}
            </Select>
          </Field>

          <Field label="Payroll Company Code">
            <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">Select payroll company code…</option>
              {options?.companies.map((c) => (
                <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="Payroll Role">
            <Select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">Select a payroll role…</option>
              {options?.roles.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
          </Field>
        </div>

        {role && ROLE_BLURB[role] && (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{ROLE_BLURB[role]}</p>
        )}

        {error && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="mt-4">
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => grant.mutate()}
            className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
          >
            {grant.isPending ? "Granting…" : "Add Payroll User Access"}
          </button>
        </div>
      </div>

      {/* Grants */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60">
            <tr>
              {["Payroll Company Code", "Linked HR Company", "User", "Payroll User Status", "Payroll Role", ""].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
            {isLoading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-400">Loading…</td></tr>
            )}

            {!isLoading && (grants?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-400 dark:text-slate-500">
                  No payroll access granted yet.
                </td>
              </tr>
            )}

            {grants?.map((g) => (
              <tr key={`${g.user_id}-${g.company_id}-${g.payroll_role}`}>
                <td className="px-4 py-2.5 font-mono text-xs text-slate-700 dark:text-slate-300">{g.company_code}</td>
                <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{g.company_name}</td>
                <td className="px-4 py-2.5">
                  <div className="font-medium text-slate-800 dark:text-slate-100">{g.user_name}</div>
                  <div className="text-xs text-slate-400 dark:text-slate-500">{g.user_email}</div>
                </td>
                <td className="px-4 py-2.5">
                  {g.is_active ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">Active</span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">Inactive</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{g.payroll_role}</td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => revoke.mutate(g)}
                    disabled={revoke.isPending}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-red-600 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500">
        Roles are the ones that actually hold payroll permissions, read from the permission tables —
        not a separate list that could drift from what the seeder grants.
      </p>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-slate-500 dark:focus:border-slate-400 focus:ring-2 focus:ring-slate-100 dark:focus:ring-slate-700 transition";

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={inputCls} {...props} />;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">{label}</label>
      {children}
    </div>
  );
}
