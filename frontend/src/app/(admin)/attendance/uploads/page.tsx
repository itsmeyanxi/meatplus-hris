"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { getMe } from "@/lib/auth";
import {
  timeLogRequestsApi,
  type TimeLogImportResult,
  type TimeLogRequest,
} from "@/lib/attendance";
import { AppButton, AppCard, PageHeader, TableShell } from "@/components/ui";

export default function TimeLogUploadsPage() {
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const perms = me?.user.permissions ?? [];
  const isItAdmin = me?.user.roles?.includes("it_admin") ?? false;
  const canUpload = isItAdmin || perms.includes("attendance.manage");
  const canApprove = isItAdmin || perms.includes("attendance.approve.any");

  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<TimeLogImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: pending = [], isLoading } = useQuery({
    queryKey: ["time-log-requests", "pending"],
    queryFn: () => timeLogRequestsApi.list("pending"),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["time-log-requests"] });

  const upload = useMutation({
    mutationFn: () => timeLogRequestsApi.import(file!),
    onSuccess: (res) => {
      setResult(res);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      invalidate();
    },
  });
  const approve = useMutation({ mutationFn: (id: number) => timeLogRequestsApi.approve(id), onSuccess: invalidate, meta: { successMessage: "Punch approved" } });
  const reject = useMutation({ mutationFn: (id: number) => timeLogRequestsApi.reject(id), onSuccess: invalidate, meta: { successMessage: "Row rejected" } });
  const approveBatch = useMutation({ mutationFn: (batch: string) => timeLogRequestsApi.approveBatch(batch), onSuccess: invalidate, meta: { successMessage: "Batch approved" } });

  // Group pending rows by their upload batch.
  const batches = useMemo(() => {
    const m = new Map<string, TimeLogRequest[]>();
    for (const r of pending) {
      const arr = m.get(r.batch_id) ?? [];
      arr.push(r);
      m.set(r.batch_id, arr);
    }
    return [...m.entries()];
  }, [pending]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Time Log Uploads"
        description="Upload a day-level attendance sheet. Rows wait here as pending and only affect attendance once an approver approves them."
      />

      {canUpload && (
        <AppCard title="Upload time logs">
          <p className="mb-3 text-sm text-slate-500">
            Two formats accepted:{" "}
            <span className="font-medium text-slate-700">Employee ID · Date · Time In · Time Out</span> (one row per day),{" "}
            or a raw biometric log <span className="font-medium text-slate-700">Biometric ID · LogTime · In/Out</span> (one row per scan — grouped into days automatically).
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={timeLogRequestsApi.templateUrl}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              title="Download a blank CSV template to fill in and upload"
            >
              <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download template
            </a>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }}
              className="text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
            />
            <AppButton onClick={() => upload.mutate()} disabled={!file || upload.isPending}>
              {upload.isPending ? "Uploading…" : "Upload"}
            </AppButton>
          </div>

          {result && (
            <div className="mt-4 space-y-2">
              <p className="text-sm text-slate-700">
                <span className="font-semibold text-emerald-700">{result.created}</span> row(s) staged as pending
                {result.errors.length > 0 && <> · <span className="font-semibold text-red-700">{result.errors.length}</span> skipped</>}.
              </p>
              {result.errors.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-lg border border-red-100 bg-red-50/60 p-3 text-xs text-red-700">
                  {result.errors.map((e, i) => <div key={i}>Row {e.row}: {e.message}</div>)}
                </div>
              )}
            </div>
          )}
        </AppCard>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Pending approval</h3>
          <span className="text-xs text-slate-500">{pending.length} row(s)</span>
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : batches.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-10 text-center text-sm text-slate-500">
            No time logs are waiting for approval.
          </div>
        ) : (
          <div className="space-y-5">
            {batches.map(([batchId, rows]) => (
              <TableShell key={batchId}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                  <div className="text-xs text-slate-500">
                    Batch · {rows.length} row(s){rows[0].uploaded_by_name ? ` · uploaded by ${rows[0].uploaded_by_name}` : ""}
                  </div>
                  {canApprove && (
                    <AppButton
                      onClick={() => approveBatch.mutate(batchId)}
                      disabled={approveBatch.isPending}
                      className="!px-3 !py-1 text-xs"
                    >
                      Approve all ({rows.length})
                    </AppButton>
                  )}
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-white text-left text-slate-600">
                      {["Employee", "Date", "Time In", "Time Out", ""].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-t border-slate-100">
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-slate-800">{r.employee?.full_name ?? `#${r.employee_id}`}</div>
                          <div className="font-mono text-xs text-slate-400">{r.employee?.employee_no}</div>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">{r.work_date}</td>
                        <td className="px-4 py-2.5 tabular-nums text-slate-700">{r.time_in ?? "—"}</td>
                        <td className="px-4 py-2.5 tabular-nums text-slate-700">{r.time_out ?? "—"}</td>
                        <td className="px-4 py-2.5">
                          {canApprove && (
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => approve.mutate(r.id)}
                                disabled={approve.isPending}
                                className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => reject.mutate(r.id)}
                                disabled={reject.isPending}
                                className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableShell>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
