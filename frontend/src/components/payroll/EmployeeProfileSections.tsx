"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppButton, TableShell } from "@/components/ui";
import { SearchSelect } from "@/components/SearchSelect";
import { inputCls, labelCls } from "@/lib/form-classes";
import {
  employeeRecordsApi,
  type EmployeeRecordType,
  type RecordRow,
} from "@/lib/employee-records";

// ── Generic record table + add modal (persisted per-employee) ────────────────

export type Field = {
  key: string;
  label: string;
  type?: "text" | "date" | "number" | "select";
  options?: string[];
  full?: boolean;
};

export function RecordSection({
  employeeId,
  type,
  addLabel,
  fields,
  minWidth = "min-w-[700px]",
}: {
  employeeId: number;
  type: EmployeeRecordType;
  addLabel: string;
  fields: Field[];
  minWidth?: string;
}) {
  const qc = useQueryClient();
  const key = ["employee", employeeId, "records", type];
  const [show, setShow] = useState(false);

  const { data: rows, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => employeeRecordsApi.list(employeeId, type),
    enabled: !!employeeId,
  });

  const create = useMutation({
    mutationFn: (data: Record<string, unknown>) => employeeRecordsApi.create(employeeId, type, data),
    onSuccess: () => { toast.success("Saved."); qc.invalidateQueries({ queryKey: key }); setShow(false); },
    onError: () => toast.error("Could not save."),
  });

  const destroy = useMutation({
    mutationFn: (id: number) => employeeRecordsApi.destroy(employeeId, type, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: () => toast.error("Could not remove."),
  });

  return (
    <div className="space-y-4">
      <div>
        <AppButton onClick={() => setShow(true)}>+ {addLabel}</AppButton>
      </div>

      <TableShell>
        <div className="overflow-x-auto">
          <table className={`w-full ${minWidth} text-sm`}>
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                {fields.map((f) => (
                  <th key={f.key} className="whitespace-nowrap px-4 py-3">{f.label}</th>
                ))}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={fields.length + 1} className="px-4 py-8 text-center text-xs text-slate-400">Loading…</td></tr>
              ) : (rows?.length ?? 0) === 0 ? (
                <tr><td colSpan={fields.length + 1} className="px-4 py-8 text-center text-xs text-slate-400">No records yet.</td></tr>
              ) : (
                rows!.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    {fields.map((f, j) => (
                      <td key={f.key} className={`whitespace-nowrap px-4 py-2.5 ${j === 0 ? "font-medium text-slate-800" : "text-slate-600"}`}>
                        {String((r as RecordRow)[f.key] ?? "") || "—"}
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => destroy.mutate(r.id)}
                        disabled={destroy.isPending}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-red-600 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </TableShell>

      {show && (
        <RecordModal
          title={addLabel}
          fields={fields}
          saving={create.isPending}
          onClose={() => setShow(false)}
          onAdd={(row) => create.mutate(row)}
        />
      )}
    </div>
  );
}

function RecordModal({
  title,
  fields,
  saving,
  onClose,
  onAdd,
}: {
  title: string;
  fields: Field[];
  saving: boolean;
  onClose: () => void;
  onAdd: (row: Record<string, string>) => void;
}) {
  const [f, setF] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((x) => [x.key, x.type === "select" && x.options ? x.options[0] : ""])),
  );
  const requiredKey = fields[0]?.key;
  const canAdd = !requiredKey || (f[requiredKey] ?? "").trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {fields.map((fd) => (
            <div key={fd.key} className={fd.full ? "col-span-2" : ""}>
              <label className={labelCls}>{fd.label}</label>
              {fd.type === "select" ? (
                <SearchSelect
                  className={inputCls}
                  value={f[fd.key]}
                  onChange={(v) => setF((s) => ({ ...s, [fd.key]: v }))}
                  options={(fd.options ?? []).map((o) => ({ value: o, label: o }))}
                />
              ) : (
                <input className={inputCls} type={fd.type ?? "text"} value={f[fd.key]} onChange={(e) => setF((s) => ({ ...s, [fd.key]: e.target.value }))} />
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <AppButton type="button" variant="secondary" onClick={onClose}>Cancel</AppButton>
          <AppButton type="button" onClick={() => onAdd(f)} disabled={!canAdd || saving}>{saving ? "Saving…" : "Add"}</AppButton>
        </div>
      </div>
    </div>
  );
}

// ── Configured record sections ──────────────────────────────────────────────

export const MemoSection = ({ employeeId }: { employeeId: number }) => (
  <RecordSection
    employeeId={employeeId}
    type="memo"
    addLabel="Add Memo"
    minWidth="min-w-[950px]"
    fields={[
      { key: "offense_level", label: "Offense Level" },
      { key: "da_type", label: "DA Type" },
      { key: "category", label: "Infraction/Violation Category" },
      { key: "date_served", label: "Date Served & Received", type: "date" },
      { key: "slide_date", label: "Slide Date", type: "date" },
      { key: "notes", label: "Notes", full: true },
    ]}
  />
);

export const SeminarsSection = ({ employeeId }: { employeeId: number }) => (
  <RecordSection
    employeeId={employeeId}
    type="seminar"
    addLabel="Add Course"
    fields={[
      { key: "course", label: "Course/Training", full: true },
      { key: "location", label: "Location", full: true },
    ]}
  />
);

export const MovementSection = ({ employeeId }: { employeeId: number }) => (
  <RecordSection
    employeeId={employeeId}
    type="movement"
    addLabel="Add Movement"
    minWidth="min-w-[900px]"
    fields={[
      { key: "type", label: "Movement Type", type: "select", options: ["Promotion", "Transfer", "Demotion", "Regularization", "Salary Adjustment", "Separation"] },
      { key: "effective_date", label: "Effective Date", type: "date" },
      { key: "from", label: "From" },
      { key: "to", label: "To" },
      { key: "remarks", label: "Remarks", full: true },
    ]}
  />
);

export const MedicalRecordsSection = ({ employeeId }: { employeeId: number }) => (
  <RecordSection
    employeeId={employeeId}
    type="medical_record"
    addLabel="Add Medical Record"
    minWidth="min-w-[800px]"
    fields={[
      { key: "file_name", label: "File Name" },
      { key: "creation_time", label: "Creation Time", type: "date" },
      { key: "classification", label: "Classification" },
      { key: "notes", label: "Notes", full: true },
    ]}
  />
);

// ── Documents (upload shell — file storage is a later pass) ──────────────────

export function DocumentsSection() {
  const [files, setFiles] = useState<string[]>([]);
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-2.5 text-xs text-amber-800">
        Preview only — file upload/storage isn&apos;t wired yet.
      </div>
      <label className="block cursor-pointer rounded-xl border-2 border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 transition hover:border-slate-400 hover:bg-slate-50">
        <input type="file" className="hidden" onChange={(e) => { const n = e.target.files?.[0]?.name; if (n) setFiles((p) => [...p, n]); }} />
        Click to upload a document
      </label>
      {files.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {files.map((name, i) => (
            <li key={i} className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700">
              <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Requirements (checklist, persisted as one record) ────────────────────────

const REQUIREMENTS = [
  "Copy of Resume", "2pcs of 2x2 picture", "2pcs of 1x1 picture", "Photocopy of Birth certificate",
  "Photocopy of Birth certificate of dependents", "Photocopy of Marriage Contract", "Photocopy of 2 valid ID",
  "Photocopy of SSS ID", "Photocopy of Philhealth ID", "Photocopy of TIN ID", "Photocopy of Pag-ibig ID/number",
  "Photocopy of latest BIR 2316", "NBI Clearance", "Copies of Certificate of Employment", "Copy of Transcript of Records",
  "Copy of Diploma", "Copy of License (PRC, etc)", "Copy of Passport", "Copy of ACR/AEP/VISA",
  "Pre-employment medical examination", "Employee Information Sheet", "ATM application", "Philhealth form (PMRF)",
  "Pag-ibig MDF printout from ONLINE MEMBERSHIP", "Pag-ibig RTMRLD form (merging form)", "BIR 1902 (without TIN #)",
  "BIR 2305 & 1905 forms", "Employment Contract", "ID application form", "Orientation Module",
  "New Hire First Day Checklist", "Waiver for non submission of BIR 2316", "Promissory Note",
  "Employment requirements Form (signed and checked)",
];

type ReqState = Record<string, { done: boolean; notes: string }>;

export function RequirementsSection({ employeeId }: { employeeId: number }) {
  const qc = useQueryClient();
  const key = ["employee", employeeId, "records", "requirements"];
  const [state, setState] = useState<ReqState>({});
  const [recordId, setRecordId] = useState<number | null>(null);

  const { data: rows } = useQuery({
    queryKey: key,
    queryFn: () => employeeRecordsApi.list(employeeId, "requirements"),
    enabled: !!employeeId,
  });

  // Load the single saved checklist record (if any) into local state.
  useEffect(() => {
    if (!rows) return;
    const rec = rows[0] as (RecordRow & { items?: ReqState }) | undefined;
    // Sync the loaded checklist into editable local state (runs on data load only).
    /* eslint-disable react-hooks/set-state-in-effect */
    setRecordId(rec?.id ?? null);
    setState((rec?.items as ReqState) ?? {});
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [rows]);

  const get = (name: string) => state[name] ?? { done: false, notes: "" };
  const patch = (name: string, p: Partial<{ done: boolean; notes: string }>) =>
    setState((s) => ({ ...s, [name]: { ...get(name), ...p } }));

  const save = useMutation({
    mutationFn: () =>
      recordId
        ? employeeRecordsApi.update(employeeId, "requirements", recordId, { items: state })
        : employeeRecordsApi.create(employeeId, "requirements", { items: state }),
    onSuccess: () => { toast.success("Requirements saved."); qc.invalidateQueries({ queryKey: key }); },
    onError: () => toast.error("Could not save requirements."),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <AppButton onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save requirements"}</AppButton>
      </div>
      <TableShell>
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50">
            <tr>
              {["Completed", "Requirement Name", "Notes"].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {REQUIREMENTS.map((name) => (
              <tr key={name} className="hover:bg-slate-50/60">
                <td className="px-4 py-2.5">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={get(name).done} onChange={(e) => patch(name, { done: e.target.checked })} />
                </td>
                <td className="px-4 py-2.5 text-slate-700">{name}</td>
                <td className="px-4 py-2.5">
                  <input className={inputCls} value={get(name).notes} onChange={(e) => patch(name, { notes: e.target.value })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}
