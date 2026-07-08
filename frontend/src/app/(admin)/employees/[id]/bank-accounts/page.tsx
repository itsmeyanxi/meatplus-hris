"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ChildListShell, EmptyRow, inputCls } from "@/components/employees/ChildList";
import {
  bankAccountsApi,
  type BankAccount,
  type BankAccountInput,
} from "@/lib/employee-relations";

const PURPOSES = ["payroll", "savings", "others"];

const EMPTY: BankAccountInput = {
  bank_name: "",
  account_number: "",
  account_name: "",
  is_primary: false,
  purpose: "payroll",
};

export default function BankAccountsTab() {
  const params = useParams<{ id: string }>();
  const employeeId = Number(params.id);
  const qc = useQueryClient();
  const key = ["bank-accounts", employeeId];

  const { data: items = [] } = useQuery({
    queryKey: key,
    queryFn: () => bankAccountsApi.list(employeeId),
  });

  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState<BankAccountInput>(EMPTY);

  const create = useMutation({
    mutationFn: () => bankAccountsApi.create(employeeId, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      setForm(EMPTY);
      setIsAdding(false);
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => bankAccountsApi.destroy(employeeId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return (
    <ChildListShell
      title="Bank Accounts"
      count={items.length}
      isAdding={isAdding}
      toggle={() => setIsAdding((v) => !v)}
    >
      {isAdding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="rounded-xl border border-slate-200 bg-white p-4 grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <input
            className={inputCls}
            placeholder="Bank name *"
            value={form.bank_name}
            onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
            required
          />
          <input
            className={inputCls}
            placeholder="Account number *"
            value={form.account_number}
            onChange={(e) => setForm({ ...form, account_number: e.target.value })}
            required
          />
          <input
            className={inputCls}
            placeholder="Account name (as printed on card) *"
            value={form.account_name}
            onChange={(e) => setForm({ ...form, account_name: e.target.value })}
            required
          />
          <select
            className={inputCls}
            value={form.purpose}
            onChange={(e) => setForm({ ...form, purpose: e.target.value })}
          >
            {PURPOSES.map((p) => (
              <option key={p} value={p}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={!!form.is_primary}
              onChange={(e) => setForm({ ...form, is_primary: e.target.checked })}
            />
            Primary / payroll account
          </label>
          <div className="sm:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={create.isPending}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {create.isPending ? "Saving…" : "Add account"}
            </button>
          </div>
        </form>
      )}

      {items.length === 0 ? (
        <EmptyRow message="No bank accounts recorded yet." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2">Bank</th>
                <th className="px-4 py-2">Account number</th>
                <th className="px-4 py-2">Account name</th>
                <th className="px-4 py-2">Purpose</th>
                <th className="px-4 py-2">Primary</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((a: BankAccount) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium">{a.bank_name}</td>
                  <td className="px-4 py-2 font-mono text-xs">{a.account_number}</td>
                  <td className="px-4 py-2">{a.account_name}</td>
                  <td className="px-4 py-2 capitalize">{a.purpose}</td>
                  <td className="px-4 py-2">
                    {a.is_primary ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        Primary
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => {
                        if (window.confirm("Remove this bank account?")) {
                          remove.mutate(a.id);
                        }
                      }}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ChildListShell>
  );
}
