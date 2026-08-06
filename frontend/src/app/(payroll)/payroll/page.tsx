"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader, AppButton, TableShell } from "@/components/ui";
import { TableSkeleton, EmptyState } from "@/components/feedback";
import { DeleteRunModal } from "@/components/payroll/DeleteRunModal";
import { inputCls, labelCls } from "@/lib/form-classes";
import {
  payrollApi,
  peso,
  type PayrollRun,
  type RunStatus,
  type NewRunInput,
} from "@/lib/payroll";

export default function PayrollPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Payroll Runs" description="Run semi-monthly payroll and manage payslips." />

      <div className="rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-2.5 text-xs text-amber-800">
        Statutory deductions (SSS, PhilHealth, Pag-IBIG) and withholding tax use simplified 2024 formulas.
        Verify against the current official tables before live payroll.
      </div>

      <RunsTab />
    </div>
  );
}

const STATUS_STYLES: Record<RunStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  computed: "bg-sky-50 text-sky-700",
  approved: "bg-amber-50 text-amber-700",
  posted: "bg-emerald-50 text-emerald-700",
};
const STATUS_DOT: Record<RunStatus, string> = {
  draft: "bg-slate-400",
  computed: "bg-sky-500",
  approved: "bg-amber-500",
  posted: "bg-emerald-500",
};

function StatusChip({ status }: { status: RunStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLES[status]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
      {status}
    </span>
  );
}

function MiniStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${highlight ? "border-brand-200 bg-brand-50" : "border-slate-200 bg-white"}`}>
      <div className={`text-[11px] font-medium uppercase tracking-wide ${highlight ? "text-brand-600" : "text-slate-500"}`}>{label}</div>
      <div className={`mt-0.5 text-lg font-bold tabular-nums ${highlight ? "text-brand-800" : "text-slate-900"}`}>{value}</div>
    </div>
  );
}

type PayGroup = "non_confidential" | "confidential";
const GROUP_LABEL: Record<PayGroup, string> = { non_confidential: "Non-confidential", confidential: "Confidential" };
/** Confidential is kept strictly separate; everything else (incl. any legacy "all" runs) is Non-confidential. */
const inGroup = (r: PayrollRun, g: PayGroup) => (g === "confidential" ? r.pay_group === "confidential" : r.pay_group !== "confidential");

function RunsTab() {
  const router = useRouter();
  const qc = useQueryClient();
  const [group, setGroup] = useState<PayGroup>("non_confidential");
  const [showForm, setShowForm] = useState(false);
  const [deletingRun, setDeletingRun] = useState<PayrollRun | null>(null);

  const { data: runs, isLoading } = useQuery({ queryKey: ["payroll-runs"], queryFn: payrollApi.listRuns });

  const all = runs ?? [];
  const list = all.filter((r) => inGroup(r, group));
  const postedRuns = list.filter((r) => r.status === "posted");
  const netPaid = postedRuns.reduce((a, r) => a + Number(r.total_net || 0), 0);

  return (
    <div className="space-y-4">
      {/* Payroll is run separately per employee group — pick which one to work on. */}
      <div className="flex w-fit items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
        {(["non_confidential", "confidential"] as PayGroup[]).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGroup(g)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${group === g ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
          >
            {GROUP_LABEL[g]}
            <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${group === g ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-600"}`}>
              {all.filter((r) => inGroup(r, g)).length}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <div className="grid flex-1 grid-cols-3 gap-3">
          <MiniStat label={`${GROUP_LABEL[group]} runs`} value={String(list.length)} />
          <MiniStat label="Posted" value={String(postedRuns.length)} />
          <MiniStat label="Net paid (posted)" value={peso(netPaid)} highlight />
        </div>
        <div className="flex sm:items-end">
          <AppButton onClick={() => setShowForm(true)}>+ New {group === "confidential" ? "confidential" : "non-confidential"} run</AppButton>
        </div>
      </div>

      {isLoading ? (
        <TableShell><TableSkeleton rows={3} cols={7} /></TableShell>
      ) : list.length === 0 ? (
        <EmptyState title={`No ${GROUP_LABEL[group].toLowerCase()} runs yet`} message="Create a run for a cutoff, then compute it." action={<AppButton onClick={() => setShowForm(true)}>+ New run</AppButton>} />
      ) : (
        <TableShell>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Run</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Pay date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Employees</th>
                <th className="px-4 py-3 text-right">Total net</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((r) => (
                <tr key={r.id} onClick={() => router.push(`/payroll/${r.id}`)} className="cursor-pointer hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {r.name}
                    {r.pay_group && (
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-500">
                        {r.pay_group === "confidential" ? "Confidential" : "Non-confi"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.period_start} → {r.period_end}</td>
                  <td className="px-4 py-3 text-slate-600">{r.pay_date}</td>
                  <td className="px-4 py-3"><StatusChip status={r.status} /></td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.payslip_count ?? 0}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{peso(r.total_net)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setDeletingRun(r); }}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      )}

      {showForm && (
        <NewRunModal
          payGroup={group}
          onClose={() => setShowForm(false)}
          onCreated={(run) => {
            qc.invalidateQueries({ queryKey: ["payroll-runs"] });
            setShowForm(false);
            router.push(`/payroll/${run.id}`);
          }}
        />
      )}

      {deletingRun && (
        <DeleteRunModal
          run={deletingRun}
          onClose={() => setDeletingRun(null)}
          onDeleted={() => {
            qc.invalidateQueries({ queryKey: ["payroll-runs"] });
            setDeletingRun(null);
          }}
        />
      )}
    </div>
  );
}

function NewRunModal({ payGroup, onClose, onCreated }: { payGroup: PayGroup; onClose: () => void; onCreated: (r: PayrollRun) => void }) {
  const [form, setForm] = useState<NewRunInput>({ name: "", pay_group: payGroup, period_start: "", period_end: "", pay_date: "" });
  const set = <K extends keyof NewRunInput>(k: K, v: NewRunInput[K]) => setForm({ ...form, [k]: v });

  const create = useMutation({
    mutationFn: () => payrollApi.createRun({ ...form, pay_group: payGroup }),
    meta: { successMessage: "Payroll run created." },
    onSuccess: onCreated,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">New {GROUP_LABEL[payGroup].toLowerCase()} run</h2>
        <form className="mt-4 space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <div>
            <label className={labelCls}>Run name</label>
            <input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="June 2026 (2nd cutoff)" required />
          </div>
          <div>
            <label className={labelCls}>Employee group</label>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${payGroup === "confidential" ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-700"}`}>
                {GROUP_LABEL[payGroup]}
              </span>
              <span className="text-slate-500">
                This run covers <strong className="text-slate-700">{payGroup === "confidential" ? "confidential" : "non-confidential"}</strong> employees only.
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Period start</label>
              <input className={inputCls} type="date" value={form.period_start} onChange={(e) => set("period_start", e.target.value)} required />
            </div>
            <div>
              <label className={labelCls}>Period end</label>
              <input className={inputCls} type="date" value={form.period_end} onChange={(e) => set("period_end", e.target.value)} required />
            </div>
          </div>
          <div>
            <label className={labelCls}>Pay date</label>
            <input className={inputCls} type="date" value={form.pay_date} onChange={(e) => set("pay_date", e.target.value)} required />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <AppButton type="button" variant="secondary" onClick={onClose}>Cancel</AppButton>
            <AppButton type="submit" disabled={create.isPending}>{create.isPending ? "Creating…" : "Create"}</AppButton>
          </div>
        </form>
      </div>
    </div>
  );
}
