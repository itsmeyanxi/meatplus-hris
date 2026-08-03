"use client";

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { importEmployees, employeeImportTemplateUrl, type ImportResult } from "@/lib/employees";
import { AppButton } from "@/components/ui";
import { SearchSelect } from "@/components/SearchSelect";
import { inputCls, labelCls } from "@/lib/form-classes";

/**
 * Bulk-import modal. `mode` locks whether the uploaded rows are organic staff or
 * agency workers — there's no in-modal toggle, so the Employees module only ever
 * imports organic people and the Agencies module only ever imports agency workers.
 */
export function ImportEmployeesModal({
  companies,
  mode,
  branchId,
  branchName,
  onClose,
  onDone,
}: {
  companies: { id: number; name?: string }[];
  mode: "organic" | "agency";
  /** Pin every imported row to this branch (per-agency bulk upload); no Branch column needed. */
  branchId?: number;
  branchName?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const isAgency = mode === "agency";
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [companyId, setCompanyId] = useState<number | "">("");
  const [result, setResult] = useState<ImportResult | null>(null);

  const upload = useMutation({
    mutationFn: () => importEmployees(file!, companyId, isAgency, branchId),
    onSuccess: (res) => {
      setResult(res);
      if (res.created > 0 || res.updated > 0) onDone();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">{isAgency ? "Import agency workers" : "Import employees"}</h2>
        <p className="mt-1 text-sm text-slate-500">
          Upload a CSV or Excel (.xlsx / .xls) file. <strong>Required:</strong> Employee ID, Last Name, First Name.
          For biometric data, also fill <strong>Biometric ID</strong> (the device PIN, so punches map to the person).
          {branchId ? (
            <> Every row is added to <strong>{branchName ?? "this agency"}</strong> — no Branch column needed.</>
          ) : isAgency ? (
            <> Put the <strong>manpower agency</strong> (e.g. EAA, Golden 5, Stellar, ATC) in the <strong>Branch</strong> column — that is the agency they belong to, not a worksite.</>
          ) : (
            <> Put the <strong>work location / site</strong> in the <strong>Branch</strong> column — a physical location, not an agency.</>
          )} Missing branches, departments, positions and employment types are created automatically. Existing employee
          IDs are updated (blank cells never overwrite existing data); new IDs are created.
        </p>
        {isAgency ? (
          <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">
            These rows are imported as <strong>agency workers</strong> — their branches are flagged as agencies, so they
            appear in the Agencies module and stay out of the organic Employees list.
          </p>
        ) : (
          <p className="mt-2 text-sm font-medium text-slate-700">
            Not sure what to put? Download the template first — its first tab explains every column.
          </p>
        )}
        <a href={employeeImportTemplateUrl}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5l5 5v9a2 2 0 01-2 2z" />
          </svg>
          Download template (Excel)
        </a>
        {!result && (
          <div className="mt-4 space-y-3">
            {companies.length > 1 && (
              <div>
                <label className={labelCls}>Import into company</label>
                <SearchSelect className={inputCls} value={companyId}
                  onChange={(v) => setCompanyId(v === "" ? "" : Number(v))}
                  placeholder="Current company"
                  options={[{ value: "", label: "Current company" }, ...companies.map((c) => ({ value: String(c.id), label: c.name ?? `Company ${c.id}` }))]} />
                <p className="mt-1 text-xs text-slate-400">Pick the company these {isAgency ? "workers" : "employees"} belong to — no need to switch your active company.</p>
              </div>
            )}
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800" />
            {file && <p className="mt-2 text-xs text-slate-500">Selected: {file.name}</p>}
          </div>
        )}
        {result && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-3">
              <Stat label="Created" value={result.created} tone="emerald" />
              <Stat label="Updated" value={result.updated} tone="sky" />
              <Stat label="Skipped" value={result.skipped} tone="amber" />
              <Stat label="Duplicates" value={result.warnings?.length ?? 0} tone="amber" />
              <Stat label="Errors" value={result.errors.length} tone="red" />
            </div>
            {result.warnings && result.warnings.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <p className="mb-1 font-semibold">Possible duplicates — imported, please verify:</p>
                {result.warnings.map((w, i) => <div key={i}>Row {w.row}: {w.message}</div>)}
              </div>
            )}
            {result.errors.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-red-100 bg-red-50/50 p-3 text-xs text-red-700">
                {result.errors.map((e, i) => <div key={i}>Row {e.row}: {e.message}</div>)}
              </div>
            )}
            <p className="text-xs text-slate-500">Any columns left blank can be completed later in each profile (or in a follow-up import).</p>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          {result ? (
            <AppButton onClick={onClose}>Done</AppButton>
          ) : (
            <>
              <AppButton variant="secondary" onClick={onClose}>Cancel</AppButton>
              <AppButton onClick={() => upload.mutate()} disabled={!file || upload.isPending}>
                {upload.isPending ? "Importing…" : "Import"}
              </AppButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "emerald" | "sky" | "amber" | "red" }) {
  const tones = { emerald: "bg-emerald-50 text-emerald-700", sky: "bg-sky-50 text-sky-700", amber: "bg-amber-50 text-amber-700", red: "bg-red-50 text-red-700" };
  return (
    <div className={`flex-1 rounded-lg px-3 py-2 text-center ${tones[tone]}`}>
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-xs font-medium">{label}</div>
    </div>
  );
}
