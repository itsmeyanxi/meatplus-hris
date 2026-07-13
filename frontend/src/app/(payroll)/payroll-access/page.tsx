"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { payrollAccessApi, type PayrollAccessRow } from "@/lib/payroll";
import { usersApi } from "@/lib/users";
import { AdvancesSection } from "@/components/payroll/AdvancesSection";
import { TrainingSection } from "@/components/payroll/TrainingSection";
import { AssetsSection } from "@/components/payroll/AssetsSection";
import { SectionShell } from "@/components/payroll/SectionShell";

const ROLE_BLURB: Record<string, string> = {
  payroll_officer: "Run, approve and post payroll; manage compensation",
  it_admin: "Full administrative access across every company",
};

const svg = (d: string) => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);
const IconAccess = () => svg("M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z");
const IconAdvances = () => svg("M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z");
const IconTraining = () => svg("M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.958a1 1 0 00.95.69h4.163c.969 0 1.371 1.24.588 1.81l-3.368 2.447a1 1 0 00-.364 1.118l1.287 3.958c.3.922-.755 1.688-1.539 1.118l-3.367-2.447a1 1 0 00-1.176 0l-3.367 2.447c-.784.57-1.838-.196-1.539-1.118l1.287-3.958a1 1 0 00-.364-1.118L2.012 9.385c-.783-.57-.38-1.81.588-1.81h4.163a1 1 0 00.95-.69l1.286-3.958z");
const IconAssets = () => svg("M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4");

export default function PayrollAccessPage() {
  const qc = useQueryClient();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // When a company code is chosen from the dropdown, the add form opens scoped to it.
  const [addCompanyId, setAddCompanyId] = useState<number | null>(null);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState<string | null>(null);

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
  const selectedCompany = options?.companies.find((c) => c.id === addCompanyId);

  // Close the company-code dropdown on an outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const closeForm = () => {
    setAddCompanyId(null);
    setUserId("");
    setRole("");
    setError(null);
  };

  const grant = useMutation({
    mutationFn: () =>
      payrollAccessApi.grant({
        user_id: Number(userId),
        company_id: addCompanyId as number,
        payroll_role: role,
      }),
    onSuccess: () => {
      closeForm();
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
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Payroll</h1>
        <p className="mt-1 text-sm text-slate-500">Payroll user access, advances and training.</p>
      </div>

      <div className="space-y-4">
        {/* 01 — Payroll User Access */}
        <SectionShell
          index={1}
          icon={<IconAccess />}
          title="Payroll User Access"
          description="Who may work on payroll, and for which company"
        >
          <div className="space-y-5">
            <p className="text-xs text-slate-400">
              Access is granted per company code. Leave a user off this list and they keep ordinary
              employee access only; a user can hold payroll access in one company and none in another.
            </p>

            {/* Add — company code first (Sprout-style dropdown) */}
            <div className="relative inline-block" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
              >
                Add Payroll User Access
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {menuOpen && (
                <div className="absolute left-0 top-full z-30 mt-1 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                  <div className="border-b border-slate-100 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                    Select payroll company code
                  </div>
                  <div className="max-h-72 overflow-y-auto py-1">
                    {options?.companies.length ? (
                      options.companies.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setAddCompanyId(c.id);
                            setUserId("");
                            setRole("");
                            setError(null);
                            setMenuOpen(false);
                          }}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                        >
                          <span className="font-mono">{c.code}</span>
                          <span className="truncate text-xs text-slate-400">{c.name}</span>
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-3 text-xs text-slate-400">No companies available.</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Grants table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {["Payroll Company Code", "Linked HR Company", "User", "Payroll User Status", "Payroll Role", ""].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {isLoading && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-400">Loading…</td></tr>
                  )}

                  {!isLoading && (grants?.length ?? 0) === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-400">
                        No payroll access granted yet.
                      </td>
                    </tr>
                  )}

                  {grants?.map((g) => (
                    <tr key={`${g.user_id}-${g.company_id}-${g.payroll_role}`}>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{g.company_code}</td>
                      <td className="px-4 py-2.5 text-slate-600">{g.company_name}</td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-slate-800">{g.user_name}</div>
                        <div className="text-xs text-slate-400">{g.user_email}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        {g.is_active ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Active</span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">Inactive</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">{g.payroll_role}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => revoke.mutate(g)}
                          disabled={revoke.isPending}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-red-600 disabled:opacity-50"
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-slate-400">
              Roles are the ones that actually hold payroll permissions, read from the permission
              tables — not a separate list that could drift from what the seeder grants.
            </p>
          </div>
        </SectionShell>

        {/* 02 — Advances */}
        <SectionShell
          index={2}
          icon={<IconAdvances />}
          title="Advances"
          description="Cash advances and loans, deducted over a schedule of pay periods"
        >
          <AdvancesSection />
        </SectionShell>

        {/* 03 — Training */}
        <SectionShell
          index={3}
          icon={<IconTraining />}
          title="Training"
          description="Seminars and trainings attended"
        >
          <TrainingSection />
        </SectionShell>

        {/* 04 — Assets */}
        <SectionShell
          index={4}
          icon={<IconAssets />}
          title="Assets"
          description="Company items issued to the employee"
        >
          <AssetsSection />
        </SectionShell>
      </div>

      {/* Add form modal, scoped to the chosen company code */}
      {addCompanyId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-base font-bold text-slate-800">Add Payroll User Access</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Payroll company code <span className="font-mono font-medium text-slate-700">{selectedCompany?.code}</span>
              {selectedCompany?.name ? ` — ${selectedCompany.name}` : ""}
            </p>

            <div className="mt-4 space-y-4">
              <Field label="User">
                <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
                  <option value="">Select a user…</option>
                  {users?.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
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
                {role && ROLE_BLURB[role] && (
                  <p className="mt-1.5 text-xs text-slate-500">{ROLE_BLURB[role]}</p>
                )}
              </Field>

              {error && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!userId || !role || grant.isPending}
                onClick={() => grant.mutate()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {grant.isPending ? "Adding…" : "Add Payroll User Access"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100 transition";

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={inputCls} {...props} />;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500">{label}</label>
      {children}
    </div>
  );
}
