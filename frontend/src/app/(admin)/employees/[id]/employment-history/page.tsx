"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ChildListShell, EmptyRow, inputCls } from "@/components/employees/ChildList";
import {
  employmentHistoryApi,
  type EmploymentHistory,
  type EmploymentHistoryInput,
} from "@/lib/employee-relations";

export default function EmploymentHistoryTab() {
  const params = useParams<{ id: string }>();
  const employeeId = Number(params.id);
  const qc = useQueryClient();
  const key = ["employment-history", employeeId];

  const { data: items = [] } = useQuery({
    queryKey: key,
    queryFn: () => employmentHistoryApi.list(employeeId),
  });

  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState<EmploymentHistoryInput>({
    company_name: "",
    position: "",
    from_date: "",
    to_date: "",
    reason_for_leaving: "",
  });

  const create = useMutation({
    mutationFn: () =>
      employmentHistoryApi.create(employeeId, {
        ...form,
        to_date: form.to_date || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      setForm({ company_name: "", position: "", from_date: "", to_date: "", reason_for_leaving: "" });
      setIsAdding(false);
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => employmentHistoryApi.destroy(employeeId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return (
    <ChildListShell
      title="Employment history"
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
            placeholder="Company name *"
            value={form.company_name}
            onChange={(e) => setForm({ ...form, company_name: e.target.value })}
            required
          />
          <input
            className={inputCls}
            placeholder="Position *"
            value={form.position}
            onChange={(e) => setForm({ ...form, position: e.target.value })}
            required
          />
          <div>
            <label className="text-xs text-slate-500">From *</label>
            <input
              type="date"
              className={inputCls}
              value={form.from_date}
              onChange={(e) => setForm({ ...form, from_date: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">To (blank = current)</label>
            <input
              type="date"
              className={inputCls}
              value={form.to_date ?? ""}
              onChange={(e) => setForm({ ...form, to_date: e.target.value })}
            />
          </div>
          <input
            className={`${inputCls} sm:col-span-2`}
            placeholder="Reason for leaving"
            value={form.reason_for_leaving ?? ""}
            onChange={(e) => setForm({ ...form, reason_for_leaving: e.target.value })}
          />
          <div className="sm:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={create.isPending}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {create.isPending ? "Saving…" : "Add entry"}
            </button>
          </div>
        </form>
      )}

      {items.length === 0 ? (
        <EmptyRow message="No prior employment recorded yet." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2">Company</th>
                <th className="px-4 py-2">Position</th>
                <th className="px-4 py-2">From</th>
                <th className="px-4 py-2">To</th>
                <th className="px-4 py-2">Reason for leaving</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((h: EmploymentHistory) => (
                <tr key={h.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium">{h.company_name}</td>
                  <td className="px-4 py-2">{h.position}</td>
                  <td className="px-4 py-2">{h.from_date}</td>
                  <td className="px-4 py-2">{h.to_date ?? "present"}</td>
                  <td className="px-4 py-2">{h.reason_for_leaving ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => remove.mutate(h.id)}
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
