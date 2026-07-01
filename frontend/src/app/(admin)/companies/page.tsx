"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCompanies, createCompany, updateCompany, type Company } from "@/lib/companies";
import { PageHeader, AppButton, TableShell } from "@/components/ui";

export default function CompaniesPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["companies"], queryFn: getCompanies });

  const [modal, setModal] = useState<{ mode: "create" } | { mode: "edit"; company: Company } | null>(null);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Companies"
        actions={
          <AppButton onClick={() => setModal({ mode: "create" })}>
            + Add Company
          </AppButton>
        }
      />

      <TableShell>
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <Th>Code</Th>
              <Th>Legal Name</Th>
              <Th>Trade Name</Th>
              <Th>Users</Th>
              <Th>Status</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <Td key={j}><div className="h-4 w-24 rounded bg-slate-200" /></Td>
                  ))}
                </tr>
              ))}
            {!isLoading && data?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">No companies yet.</td>
              </tr>
            )}
            {data?.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <Td><span className="font-mono font-medium text-slate-900">{c.code}</span></Td>
                <Td>{c.legal_name}</Td>
                <Td>{c.trade_name ?? "—"}</Td>
                <Td>{c.users_count ?? "—"}</Td>
                <Td>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    c.is_active ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"
                  }`}>
                    {c.is_active ? "Active" : "Inactive"}
                  </span>
                </Td>
                <Td>
                  <button
                    onClick={() => setModal({ mode: "edit", company: c })}
                    className="text-xs text-slate-500 hover:text-slate-900 underline"
                  >
                    Edit
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>

      {modal && (
        <CompanyModal
          mode={modal.mode}
          company={modal.mode === "edit" ? modal.company : undefined}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); qc.invalidateQueries({ queryKey: ["companies"] }); }}
        />
      )}
    </div>
  );
}

function CompanyModal({
  mode,
  company,
  onClose,
  onDone,
}: {
  mode: "create" | "edit";
  company?: Company;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    code: company?.code ?? "",
    legal_name: company?.legal_name ?? "",
    trade_name: company?.trade_name ?? "",
    is_active: company?.is_active ?? true,
  });
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...form, trade_name: form.trade_name || null };
      if (mode === "create") return createCompany(payload);
      return updateCompany(company!.id, payload);
    },
    onSuccess: onDone,
    onError: (e: any) => {
      const msg = e?.response?.data?.message ?? e?.response?.data?.errors
        ? Object.values(e.response.data.errors as Record<string, string[]>).flat().join(" ")
        : "Something went wrong.";
      setError(msg);
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">
          {mode === "create" ? "Add Company" : "Edit Company"}
        </h2>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-700">Code</span>
            <input
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="e.g. PASEI"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-700">Legal Name</span>
            <input
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              value={form.legal_name}
              onChange={(e) => setForm((f) => ({ ...f, legal_name: e.target.value }))}
              placeholder="Full legal name"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-700">Trade Name <span className="text-slate-400">(optional)</span></span>
            <input
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              value={form.trade_name}
              onChange={(e) => setForm((f) => ({ ...f, trade_name: e.target.value }))}
              placeholder="Short display name"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              className="rounded"
            />
            Active
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <AppButton onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </AppButton>
        </div>
      </div>
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="px-4 py-3">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-middle">{children}</td>;
}
