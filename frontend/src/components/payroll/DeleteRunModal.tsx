"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AppButton } from "@/components/ui";
import { inputCls, labelCls } from "@/lib/form-classes";
import { payrollApi, type PayrollRun } from "@/lib/payroll";

/**
 * Confirmation dialog for deleting a payroll run. A reason is mandatory — it is
 * sent to the API and recorded on the audit trail (with the acting user) — and
 * deleting a *posted* run is called out as reversing a finalized payroll.
 */
export function DeleteRunModal({
  run,
  onClose,
  onDeleted,
}: {
  run: PayrollRun;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  const canDelete = trimmed.length >= 5;

  const remove = useMutation({
    mutationFn: () => payrollApi.deleteRun(run.id, trimmed),
    meta: { successMessage: "Payroll run deleted." },
    onSuccess: onDeleted,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900">Delete payroll run?</h2>
            <p className="mt-1 text-sm text-slate-500">
              This permanently deletes <strong className="text-slate-800">{run.name}</strong> ({run.period_start} → {run.period_end})
              {" "}and all <strong className="text-slate-800">{run.payslip_count ?? 0}</strong> payslips under it. This cannot be undone.
            </p>
          </div>
        </div>

        {run.status === "posted" && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            This run is <strong>posted</strong>. Deleting it reverses a finalized payroll — proceed only if you are sure.
          </p>
        )}

        <div className="mt-4">
          <label className={labelCls}>Reason for deletion <span className="text-red-500">*</span></label>
          <textarea
            className={inputCls}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this run being deleted? (recorded on the audit trail)"
            autoFocus
          />
          <p className="mt-1 text-xs text-slate-400">Required. This is recorded on the audit trail with your name.</p>
        </div>

        {remove.isError && <p className="mt-2 text-xs text-red-600">Could not delete the run. Please try again.</p>}

        <div className="mt-5 flex justify-end gap-2">
          <AppButton variant="secondary" onClick={onClose}>Cancel</AppButton>
          <button
            type="button"
            onClick={() => remove.mutate()}
            disabled={!canDelete || remove.isPending}
            className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {remove.isPending ? "Deleting…" : "Delete run"}
          </button>
        </div>
      </div>
    </div>
  );
}
