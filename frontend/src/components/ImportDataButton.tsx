"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

export type SimpleImportResult = {
  created: number;
  updated?: number;
  skipped: number;
  total?: number;
  errors: { row: number; message: string }[];
};

/**
 * Reusable "Import from file" button + modal. Give it an importFn (File ->
 * result) and it shows the created/updated/skipped/errors summary, matching the
 * employee-import UX. Optionally invalidates query keys after a successful run.
 */
export function ImportDataButton({
  label = "Import",
  title,
  description,
  columns,
  templateUrl,
  importFn,
  invalidateKeys = [],
}: {
  label?: string;
  title: string;
  description: string;
  columns: string;
  templateUrl?: string;
  importFn: (file: File) => Promise<SimpleImportResult>;
  invalidateKeys?: unknown[][];
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<SimpleImportResult | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  const upload = useMutation({
    mutationFn: () => importFn(file!),
    onSuccess: (res) => {
      setResult(res);
      invalidateKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    },
  });

  const reset = () => { setFile(null); setResult(null); if (ref.current) ref.current.value = ""; };
  const close = () => { setOpen(false); reset(); upload.reset(); };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 12V3m0 0L8 7m4-4l4 4" />
        </svg>
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={close}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
            <p className="mt-2 text-xs text-slate-500">
              Columns: <span className="font-medium text-slate-700">{columns}</span>
            </p>
            {templateUrl && (
              <a
                href={templateUrl}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5l5 5v9a2 2 0 01-2 2z" />
                </svg>
                Download template
              </a>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <input
                ref={ref}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }}
                className="text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
              />
            </div>

            {result && (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-3">
                  <Stat label="Created" value={result.created} tone="emerald" />
                  {result.updated != null && <Stat label="Updated" value={result.updated} tone="sky" />}
                  <Stat label="Skipped (already there)" value={result.skipped} tone="amber" />
                  <Stat label="Errors" value={result.errors.length} tone="red" />
                </div>
                {result.errors.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-red-100 bg-red-50/60 p-3 text-xs text-red-700">
                    {result.errors.map((e, i) => <div key={i}>Row {e.row}: {e.message}</div>)}
                  </div>
                )}
              </div>
            )}
            {upload.isError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Import failed. Check the file and try again.</p>}

            <div className="mt-5 flex justify-end gap-2">
              {result ? (
                <button onClick={close} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Done</button>
              ) : (
                <>
                  <button onClick={close} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
                  <button
                    onClick={() => upload.mutate()}
                    disabled={!file || upload.isPending}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {upload.isPending ? "Importing…" : "Import"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "emerald" | "sky" | "amber" | "red" }) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-700",
    sky: "bg-sky-50 text-sky-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
  } as const;
  return (
    <div className={`rounded-lg px-3 py-2 ${tones[tone]}`}>
      <div className="text-lg font-bold">{value}</div>
      <div className="text-[11px] font-medium">{label}</div>
    </div>
  );
}
