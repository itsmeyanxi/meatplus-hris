"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ChildListShell, EmptyRow, inputCls } from "@/components/employees/ChildList";
import {
  dependentsApi,
  type Dependent,
  type DependentInput,
} from "@/lib/employee-relations";

const RELATIONSHIPS = ["spouse", "child", "parent", "sibling", "grandparent", "other"];

export default function DependentsTab() {
  const params = useParams<{ id: string }>();
  const employeeId = Number(params.id);
  const qc = useQueryClient();
  const key = ["dependents", employeeId];

  const { data: items = [] } = useQuery({
    queryKey: key,
    queryFn: () => dependentsApi.list(employeeId),
  });

  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState<DependentInput>({
    full_name: "",
    relationship: "child",
    birth_date: "",
    is_qualified_for_tax_exemption: false,
  });

  const create = useMutation({
    mutationFn: () =>
      dependentsApi.create(employeeId, {
        ...form,
        birth_date: form.birth_date || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      setForm({ full_name: "", relationship: "child", birth_date: "" });
      setIsAdding(false);
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => dependentsApi.destroy(employeeId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return (
    <ChildListShell
      title="Dependents"
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
            placeholder="Full name *"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            required
          />
          <select
            className={inputCls}
            value={form.relationship}
            onChange={(e) => setForm({ ...form, relationship: e.target.value })}
          >
            {RELATIONSHIPS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <input
            type="date"
            className={inputCls}
            value={form.birth_date ?? ""}
            onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
          />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={!!form.is_qualified_for_tax_exemption}
              onChange={(e) =>
                setForm({ ...form, is_qualified_for_tax_exemption: e.target.checked })
              }
            />
            Qualified for tax exemption
          </label>
          <div className="sm:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={create.isPending}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {create.isPending ? "Saving…" : "Add dependent"}
            </button>
          </div>
        </form>
      )}

      {items.length === 0 ? (
        <EmptyRow message="No dependents recorded yet." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Relationship</th>
                <th className="px-4 py-2">Birth date</th>
                <th className="px-4 py-2">Tax exemption</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((d: Dependent) => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium">{d.full_name}</td>
                  <td className="px-4 py-2">{d.relationship}</td>
                  <td className="px-4 py-2">{d.birth_date ?? "—"}</td>
                  <td className="px-4 py-2">
                    {d.is_qualified_for_tax_exemption ? "Yes" : "No"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => remove.mutate(d.id)}
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
