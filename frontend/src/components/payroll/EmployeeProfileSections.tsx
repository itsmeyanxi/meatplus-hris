"use client";

import { useState } from "react";
import { AppButton, TableShell } from "@/components/ui";
import { inputCls, labelCls } from "@/lib/form-classes";

// UI shells only — none of these persist to the server yet. Each mirrors a Sprout
// employee-profile section so the layout is in place; wiring is a later pass.

const PreviewNote = () => (
  <div className="rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-2.5 text-xs text-amber-800">
    Preview only — not saved to the server yet.
  </div>
);

// ── Generic record table + add modal ────────────────────────────────────────

type Field = {
  key: string;
  label: string;
  type?: "text" | "date" | "number" | "select";
  options?: string[];
  full?: boolean;
};

function RecordSection({
  addLabel,
  fields,
  minWidth = "min-w-[700px]",
}: {
  addLabel: string;
  fields: Field[];
  minWidth?: string;
}) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [show, setShow] = useState(false);
  const requiredKey = fields[0]?.key;

  return (
    <div className="space-y-4">
      <PreviewNote />
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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={fields.length} className="px-4 py-8 text-center text-xs text-slate-400">
                    No records yet.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50/60">
                    {fields.map((f, j) => (
                      <td key={f.key} className={`whitespace-nowrap px-4 py-2.5 ${j === 0 ? "font-medium text-slate-800" : "text-slate-600"}`}>
                        {r[f.key] || "—"}
                      </td>
                    ))}
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
          requiredKey={requiredKey}
          onClose={() => setShow(false)}
          onAdd={(row) => {
            setRows((p) => [...p, row]);
            setShow(false);
          }}
        />
      )}
    </div>
  );
}

function RecordModal({
  title,
  fields,
  requiredKey,
  onClose,
  onAdd,
}: {
  title: string;
  fields: Field[];
  requiredKey?: string;
  onClose: () => void;
  onAdd: (row: Record<string, string>) => void;
}) {
  const [f, setF] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((x) => [x.key, x.type === "select" && x.options ? x.options[0] : ""])),
  );
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
                <select className={inputCls} value={f[fd.key]} onChange={(e) => setF((s) => ({ ...s, [fd.key]: e.target.value }))}>
                  {fd.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  className={inputCls}
                  type={fd.type ?? "text"}
                  value={f[fd.key]}
                  onChange={(e) => setF((s) => ({ ...s, [fd.key]: e.target.value }))}
                />
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <AppButton type="button" variant="secondary" onClick={onClose}>Cancel</AppButton>
          <AppButton type="button" onClick={() => onAdd(f)} disabled={!canAdd}>Add</AppButton>
        </div>
      </div>
    </div>
  );
}

// ── Configured record sections ──────────────────────────────────────────────

export const MemoSection = () => (
  <RecordSection
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

export const SeminarsSection = () => (
  <RecordSection
    addLabel="Add Course"
    fields={[
      { key: "course", label: "Course/Training", full: true },
      { key: "location", label: "Location", full: true },
    ]}
  />
);

export const EmploymentRecordSection = () => (
  <RecordSection
    addLabel="Add Employment Record"
    minWidth="min-w-[800px]"
    fields={[
      { key: "position", label: "Position" },
      { key: "company", label: "Company" },
      { key: "industry", label: "Industry" },
      { key: "from", label: "From", type: "date" },
      { key: "to", label: "To", type: "date" },
    ]}
  />
);

export const MovementSection = () => (
  <RecordSection
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

export const MedicalRecordsSection = () => (
  <RecordSection
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

// ── Documents (upload shell) ────────────────────────────────────────────────

export function DocumentsSection() {
  const [files, setFiles] = useState<string[]>([]);
  return (
    <div className="space-y-4">
      <PreviewNote />
      <label className="block cursor-pointer rounded-xl border-2 border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 transition hover:border-slate-400 hover:bg-slate-50">
        <input
          type="file"
          className="hidden"
          onChange={(e) => {
            const n = e.target.files?.[0]?.name;
            if (n) setFiles((p) => [...p, n]);
          }}
        />
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

// ── Requirements (checklist) ────────────────────────────────────────────────

const REQUIREMENTS = [
  "Copy of Resume",
  "2pcs of 2x2 picture",
  "2pcs of 1x1 picture",
  "Photocopy of Birth certificate",
  "Photocopy of Birth certificate of dependents",
  "Photocopy of Marriage Contract",
  "Photocopy of 2 valid ID",
  "Photocopy of SSS ID",
  "Photocopy of Philhealth ID",
  "Photocopy of TIN ID",
  "Photocopy of Pag-ibig ID/number",
  "Photocopy of latest BIR 2316",
  "NBI Clearance",
  "Copies of Certificate of Employment",
  "Copy of Transcript of Records",
  "Copy of Diploma",
  "Copy of License (PRC, etc)",
  "Copy of Passport",
  "Copy of ACR/AEP/VISA",
  "Pre-employment medical examination",
  "Employee Information Sheet",
  "ATM application",
  "Philhealth form (PMRF)",
  "Pag-ibig MDF printout from ONLINE MEMBERSHIP",
  "Pag-ibig RTMRLD form (merging form)",
  "BIR 1902 (without TIN #)",
  "BIR 2305 & 1905 forms",
  "Employment Contract",
  "ID application form",
  "Orientation Module",
  "New Hire First Day Checklist",
  "Waiver for non submission of BIR 2316",
  "Promissory Note",
  "Employment requirements Form (signed and checked)",
];

export function RequirementsSection() {
  const [state, setState] = useState<Record<string, { done: boolean; notes: string }>>({});
  const get = (name: string) => state[name] ?? { done: false, notes: "" };
  const patch = (name: string, p: Partial<{ done: boolean; notes: string }>) =>
    setState((s) => ({ ...s, [name]: { ...get(name), ...p } }));

  return (
    <div className="space-y-4">
      <PreviewNote />
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
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300"
                    checked={get(name).done}
                    onChange={(e) => patch(name, { done: e.target.checked })}
                  />
                </td>
                <td className="px-4 py-2.5 text-slate-700">{name}</td>
                <td className="px-4 py-2.5">
                  <input
                    className={inputCls}
                    value={get(name).notes}
                    onChange={(e) => patch(name, { notes: e.target.value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}

// ── Access Level (form shell) ───────────────────────────────────────────────

const ACCESS_LEVELS = [
  "Employee",
  "Super Admin2",
  "Supervisor/Manager",
  "Team Lead",
  "Admin Dept. Access",
  "Payroll Access",
  "Transport Access",
  "Sales Employee",
  "Timekeeper",
  "HR Coordinator",
  "Super Admin",
  "Garahe Access Teamlead/Timekeep",
  "Super admin and Timekeeping",
];

export function AccessLevelSection() {
  const [f, setF] = useState({ employee_code: "", login_name: "", user_level: "" });
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));

  return (
    <div className="space-y-4">
      <PreviewNote />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Employee Code</label>
            <input className={inputCls} value={f.employee_code} onChange={(e) => set("employee_code", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>User Level</label>
            <select className={inputCls} value={f.user_level} onChange={(e) => set("user_level", e.target.value)}>
              <option value="">Please select Access Level</option>
              {ACCESS_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <div>
            <label className={labelCls}>Login Name <span className="text-red-500">*</span></label>
            <input className={inputCls} value={f.login_name} onChange={(e) => set("login_name", e.target.value)} />
          </div>
          <div className="text-xs text-slate-500">
            <p className="font-medium text-slate-600">Password</p>
            <p className="mt-0.5">The user will receive a reset password link upon creation.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
