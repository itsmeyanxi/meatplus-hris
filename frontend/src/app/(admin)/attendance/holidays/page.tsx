"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ChildListShell, EmptyRow, inputCls } from "@/components/employees/ChildList";
import { holidaysApi, type Holiday, type HolidayInput } from "@/lib/attendance";

const TYPE_LABELS: Record<Holiday["type"], string> = {
  regular: "Regular",
  special_non_working: "Special (non-working)",
  special_working: "Special (working)",
  local: "Local",
};

export default function HolidaysPage() {
  const qc = useQueryClient();
  const key = ["holidays"];
  const { data: items = [] } = useQuery({ queryKey: key, queryFn: () => holidaysApi.list() });

  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState<HolidayInput>({
    holiday_date: "",
    name: "",
    type: "regular",
  });

  const create = useMutation({
    mutationFn: () => holidaysApi.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      setForm({ holiday_date: "", name: "", type: "regular" });
      setIsAdding(false);
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => holidaysApi.destroy(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return (
    <ChildListShell
      title="Holidays"
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
          className="rounded-xl border border-slate-200 bg-white p-4 grid grid-cols-1 gap-3 sm:grid-cols-3"
        >
          <input
            type="date"
            className={inputCls}
            value={form.holiday_date}
            onChange={(e) => setForm({ ...form, holiday_date: e.target.value })}
            required
          />
          <input
            className={inputCls}
            placeholder="Holiday name *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <select
            className={inputCls}
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as Holiday["type"] })}
          >
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <div className="sm:col-span-3 flex justify-end">
            <button
              type="submit"
              disabled={create.isPending}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {create.isPending ? "Saving…" : "Add holiday"}
            </button>
          </div>
        </form>
      )}

      {items.length === 0 ? (
        <EmptyRow message="No holidays yet." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((h) => (
                <tr key={h.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono">{h.holiday_date}</td>
                  <td className="px-4 py-2 font-medium">{h.name}</td>
                  <td className="px-4 py-2">{TYPE_LABELS[h.type]}</td>
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
