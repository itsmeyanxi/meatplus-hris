"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ChildListShell, EmptyRow, inputCls } from "@/components/employees/ChildList";
import { SearchSelect } from "@/components/SearchSelect";
import {
  educationApi,
  type Education,
  type EducationInput,
} from "@/lib/employee-relations";

const LEVELS = ["elementary", "secondary", "vocational", "tertiary", "graduate"];

export default function EducationTab() {
  const params = useParams<{ id: string }>();
  const employeeId = Number(params.id);
  const qc = useQueryClient();
  const key = ["education", employeeId];

  const { data: items = [] } = useQuery({
    queryKey: key,
    queryFn: () => educationApi.list(employeeId),
  });

  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState<EducationInput>({
    level: "tertiary",
    school: "",
    degree: "",
    year_from: null,
    year_to: null,
    honors: "",
  });

  const create = useMutation({
    mutationFn: () =>
      educationApi.create(employeeId, {
        ...form,
        year_from: form.year_from || null,
        year_to: form.year_to || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      setForm({ level: "tertiary", school: "", degree: "", year_from: null, year_to: null, honors: "" });
      setIsAdding(false);
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => educationApi.destroy(employeeId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return (
    <ChildListShell
      title="Education"
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
          <SearchSelect
            className={inputCls}
            value={form.level}
            onChange={(v) => setForm({ ...form, level: v })}
            options={LEVELS.map((l) => ({ value: l, label: l }))}
          />
          <input
            className={`${inputCls} sm:col-span-2`}
            placeholder="School *"
            value={form.school}
            onChange={(e) => setForm({ ...form, school: e.target.value })}
            required
          />
          <input
            className={`${inputCls} sm:col-span-3`}
            placeholder="Degree / track"
            value={form.degree ?? ""}
            onChange={(e) => setForm({ ...form, degree: e.target.value })}
          />
          <input
            type="number"
            className={inputCls}
            placeholder="Year from"
            value={form.year_from ?? ""}
            onChange={(e) =>
              setForm({ ...form, year_from: e.target.value ? Number(e.target.value) : null })
            }
          />
          <input
            type="number"
            className={inputCls}
            placeholder="Year to"
            value={form.year_to ?? ""}
            onChange={(e) =>
              setForm({ ...form, year_to: e.target.value ? Number(e.target.value) : null })
            }
          />
          <input
            className={inputCls}
            placeholder="Honors"
            value={form.honors ?? ""}
            onChange={(e) => setForm({ ...form, honors: e.target.value })}
          />
          <div className="sm:col-span-3 flex justify-end">
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
        <EmptyRow message="No education records yet." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2">Level</th>
                <th className="px-4 py-2">School</th>
                <th className="px-4 py-2">Degree</th>
                <th className="px-4 py-2">Years</th>
                <th className="px-4 py-2">Honors</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((e: Education) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 capitalize">{e.level}</td>
                  <td className="px-4 py-2 font-medium">{e.school}</td>
                  <td className="px-4 py-2">{e.degree ?? "—"}</td>
                  <td className="px-4 py-2">
                    {e.year_from ?? "?"}–{e.year_to ?? "present"}
                  </td>
                  <td className="px-4 py-2">{e.honors ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => remove.mutate(e.id)}
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
