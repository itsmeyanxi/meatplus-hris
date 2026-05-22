"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ChildListShell, EmptyRow, inputCls } from "@/components/employees/ChildList";
import {
  emergencyContactsApi,
  type EmergencyContact,
  type EmergencyContactInput,
} from "@/lib/employee-relations";

export default function EmergencyContactsTab() {
  const params = useParams<{ id: string }>();
  const employeeId = Number(params.id);
  const qc = useQueryClient();
  const key = ["emergency-contacts", employeeId];

  const { data: items = [] } = useQuery({
    queryKey: key,
    queryFn: () => emergencyContactsApi.list(employeeId),
  });

  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<EmergencyContactInput>({
    name: "",
    relationship: "",
    phone: "",
    mobile: "",
    address: "",
  });

  const create = useMutation({
    mutationFn: () => emergencyContactsApi.create(employeeId, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      setForm({ name: "", relationship: "", phone: "", mobile: "", address: "" });
      setIsAdding(false);
      setError(null);
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { errors?: Record<string, string[]> } } };
      const msgs = err?.response?.data?.errors;
      setError(msgs ? Object.values(msgs).flat().join(" ") : "Failed to add contact");
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => emergencyContactsApi.destroy(employeeId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return (
    <ChildListShell
      title="Emergency contacts"
      count={items.length}
      isAdding={isAdding}
      toggle={() => {
        setIsAdding((v) => !v);
        setError(null);
      }}
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
            placeholder="Name *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <input
            className={inputCls}
            placeholder="Relationship *"
            value={form.relationship}
            onChange={(e) => setForm({ ...form, relationship: e.target.value })}
            required
          />
          <input
            className={inputCls}
            placeholder="Phone"
            value={form.phone ?? ""}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <input
            className={inputCls}
            placeholder="Mobile"
            value={form.mobile ?? ""}
            onChange={(e) => setForm({ ...form, mobile: e.target.value })}
          />
          <input
            className={`${inputCls} sm:col-span-2`}
            placeholder="Address"
            value={form.address ?? ""}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
          {error && (
            <p className="sm:col-span-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}
          <div className="sm:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={create.isPending}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {create.isPending ? "Saving…" : "Add contact"}
            </button>
          </div>
        </form>
      )}

      {items.length === 0 ? (
        <EmptyRow message="No emergency contacts recorded yet." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Relationship</th>
                <th className="px-4 py-2">Phone</th>
                <th className="px-4 py-2">Mobile</th>
                <th className="px-4 py-2">Address</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((c: EmergencyContact) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium">{c.name}</td>
                  <td className="px-4 py-2">{c.relationship}</td>
                  <td className="px-4 py-2">{c.phone ?? "—"}</td>
                  <td className="px-4 py-2">{c.mobile ?? "—"}</td>
                  <td className="px-4 py-2">{c.address ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => remove.mutate(c.id)}
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
