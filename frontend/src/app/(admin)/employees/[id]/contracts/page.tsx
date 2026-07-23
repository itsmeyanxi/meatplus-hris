"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ChildListShell, EmptyRow, inputCls } from "@/components/employees/ChildList";
import { SearchSelect } from "@/components/SearchSelect";
import {
  contractsApi,
  type Contract,
  type ContractInput,
} from "@/lib/employee-relations";
import { api } from "@/lib/api";

const CONTRACT_TYPES = [
  "regular",
  "probationary",
  "project-based",
  "seasonal",
  "fixed-term",
  "part-time",
];

type PositionOption = { id: number; title: string };

const EMPTY: ContractInput = {
  contract_type: "probationary",
  effective_from: "",
  effective_to: "",
  position_id: "",
  monthly_rate: "",
};

export default function ContractsTab() {
  const params = useParams<{ id: string }>();
  const employeeId = Number(params.id);
  const qc = useQueryClient();
  const key = ["contracts", employeeId];

  const { data: items = [] } = useQuery({
    queryKey: key,
    queryFn: () => contractsApi.list(employeeId),
  });

  const { data: positions = [] } = useQuery({
    queryKey: ["lookups", "positions"],
    queryFn: async () => {
      const { data } = await api.get<{ data: PositionOption[] }>("/api/v1/lookups/positions");
      return data.data;
    },
    staleTime: 5 * 60_000,
  });

  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState<ContractInput>(EMPTY);

  const create = useMutation({
    mutationFn: () =>
      contractsApi.create(employeeId, {
        ...form,
        effective_to: form.effective_to || null,
        position_id: Number(form.position_id),
        monthly_rate: Number(form.monthly_rate),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      setForm(EMPTY);
      setIsAdding(false);
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => contractsApi.destroy(employeeId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return (
    <ChildListShell
      title="Contracts"
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
          <SearchSelect
            className={inputCls}
            value={form.contract_type}
            onChange={(v) => setForm({ ...form, contract_type: v })}
            options={CONTRACT_TYPES.map((t) => ({
              value: t,
              label: t.charAt(0).toUpperCase() + t.slice(1).replace(/-/g, " "),
            }))}
          />

          <SearchSelect
            className={inputCls}
            value={form.position_id}
            onChange={(v) => setForm({ ...form, position_id: v })}
            placeholder="Select position *"
            options={positions.map((p) => ({ value: String(p.id), label: p.title }))}
          />

          <div>
            <label className="text-xs text-slate-500">Effective from *</label>
            <input
              type="date"
              className={inputCls}
              value={form.effective_from}
              onChange={(e) => setForm({ ...form, effective_from: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="text-xs text-slate-500">Effective to (blank = open-ended)</label>
            <input
              type="date"
              className={inputCls}
              value={form.effective_to ?? ""}
              onChange={(e) => setForm({ ...form, effective_to: e.target.value })}
            />
          </div>

          <div>
            <label className="text-xs text-slate-500">Monthly rate *</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputCls}
              placeholder="0.00"
              value={form.monthly_rate}
              onChange={(e) => setForm({ ...form, monthly_rate: e.target.value })}
              required
            />
          </div>

          <div className="sm:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={create.isPending}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {create.isPending ? "Saving…" : "Add contract"}
            </button>
          </div>
        </form>
      )}

      {items.length === 0 ? (
        <EmptyRow message="No contracts recorded yet." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Position</th>
                <th className="px-4 py-2">Effective from</th>
                <th className="px-4 py-2">Effective to</th>
                <th className="px-4 py-2">Monthly rate</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((c: Contract) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 capitalize">
                    {c.contract_type.replace(/-/g, " ")}
                  </td>
                  <td className="px-4 py-2 font-medium">
                    {c.position?.title ?? `Position #${c.position_id}`}
                  </td>
                  <td className="px-4 py-2">{c.effective_from}</td>
                  <td className="px-4 py-2">{c.effective_to ?? "open-ended"}</td>
                  <td className="px-4 py-2">
                    {Number(c.monthly_rate).toLocaleString("en-PH", {
                      style: "currency",
                      currency: "PHP",
                    })}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => {
                        if (window.confirm("Remove this contract record?")) {
                          remove.mutate(c.id);
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
