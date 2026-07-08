"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { inputCls } from "@/components/employees/ChildList";
import {
  governmentIdsApi,
  type GovernmentId,
  type GovernmentIdInput,
} from "@/lib/employee-relations";

const EMPTY: GovernmentIdInput = {
  tin: "",
  sss_no: "",
  philhealth_no: "",
  pagibig_no: "",
  prc_no: "",
  prc_expiry: "",
};

function toInput(record: GovernmentId | null): GovernmentIdInput {
  if (!record) return EMPTY;
  return {
    tin: record.tin ?? "",
    sss_no: record.sss_no ?? "",
    philhealth_no: record.philhealth_no ?? "",
    pagibig_no: record.pagibig_no ?? "",
    prc_no: record.prc_no ?? "",
    prc_expiry: record.prc_expiry ?? "",
  };
}

export default function GovernmentIdsTab() {
  const params = useParams<{ id: string }>();
  const employeeId = Number(params.id);
  const qc = useQueryClient();
  const key = ["government-ids", employeeId];

  const { data: record, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => governmentIdsApi.get(employeeId),
  });

  const [form, setForm] = useState<GovernmentIdInput>(EMPTY);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (record !== undefined) {
      setForm(toInput(record));
      setDirty(false);
    }
  }, [record]);

  const save = useMutation({
    mutationFn: () =>
      governmentIdsApi.save(employeeId, {
        ...form,
        tin: form.tin || null,
        sss_no: form.sss_no || null,
        philhealth_no: form.philhealth_no || null,
        pagibig_no: form.pagibig_no || null,
        prc_no: form.prc_no || null,
        prc_expiry: form.prc_expiry || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      setDirty(false);
    },
  });

  function set(field: keyof GovernmentIdInput, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setDirty(true);
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-md bg-slate-100" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Government IDs</h3>
        {record?.updated_at && (
          <span className="text-xs text-slate-400">
            Last updated: {new Date(record.updated_at).toLocaleDateString()}
          </span>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="rounded-xl border border-slate-200 bg-white p-5"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="TIN">
            <input
              className={inputCls}
              placeholder="000-000-000-000"
              value={form.tin ?? ""}
              onChange={(e) => set("tin", e.target.value)}
            />
          </Field>

          <Field label="SSS No.">
            <input
              className={inputCls}
              placeholder="00-0000000-0"
              value={form.sss_no ?? ""}
              onChange={(e) => set("sss_no", e.target.value)}
            />
          </Field>

          <Field label="PhilHealth No.">
            <input
              className={inputCls}
              placeholder="00-000000000-0"
              value={form.philhealth_no ?? ""}
              onChange={(e) => set("philhealth_no", e.target.value)}
            />
          </Field>

          <Field label="Pag-IBIG / HDMF No.">
            <input
              className={inputCls}
              placeholder="0000-0000-0000"
              value={form.pagibig_no ?? ""}
              onChange={(e) => set("pagibig_no", e.target.value)}
            />
          </Field>

          <Field label="PRC License No.">
            <input
              className={inputCls}
              placeholder="License number"
              value={form.prc_no ?? ""}
              onChange={(e) => set("prc_no", e.target.value)}
            />
          </Field>

          <Field label="PRC Expiry Date">
            <input
              type="date"
              className={inputCls}
              value={form.prc_expiry ?? ""}
              onChange={(e) => set("prc_expiry", e.target.value)}
            />
          </Field>
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
          <p className="text-xs text-slate-400">
            All ID numbers are stored encrypted.
          </p>
          <button
            type="submit"
            disabled={save.isPending || !dirty}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {save.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>

        {save.isError && (
          <p className="mt-2 text-xs text-red-600">
            Failed to save. Please try again.
          </p>
        )}
        {save.isSuccess && !dirty && (
          <p className="mt-2 text-xs text-green-600">Saved successfully.</p>
        )}
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-slate-500">{label}</label>
      {children}
    </div>
  );
}
