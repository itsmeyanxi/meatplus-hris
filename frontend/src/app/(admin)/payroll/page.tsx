"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, AppButton, TableShell } from "@/components/ui";
import { TableSkeleton, EmptyState } from "@/components/feedback";
import { inputCls, labelCls } from "@/lib/form-classes";
import {
  payrollApi,
  compensationApi,
  peso,
  type PayrollRun,
  type RunStatus,
  type NewRunInput,
  type CompRow,
} from "@/lib/payroll";

type Tab = "runs" | "compensation";

export default function PayrollPage() {
  const [tab, setTab] = useState<Tab>("runs");

  return (
    <div className="space-y-6">
      <PageHeader title="Payroll" description="Run semi-monthly payroll and manage employee compensation." />

      <div className="flex gap-1 border-b border-slate-200">
        {([["runs", "Payroll Runs"], ["compensation", "Compensation"]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={
              tab === k
                ? "-mb-px border-b-2 border-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-900"
                : "px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-800"
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-2.5 text-xs text-amber-800">
        Statutory deductions (SSS, PhilHealth, Pag-IBIG) and withholding tax use simplified 2024 formulas.
        Verify against the current official tables before live payroll.
      </div>

      {tab === "runs" ? <RunsTab /> : <CompensationTab />}
    </div>
  );
}

const STATUS_STYLES: Record<RunStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  computed: "bg-sky-50 text-sky-700",
  approved: "bg-amber-50 text-amber-700",
  posted: "bg-emerald-50 text-emerald-700",
};

function StatusChip({ status }: { status: RunStatus }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLES[status]}`}>{status}</span>;
}

function RunsTab() {
  const router = useRouter();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: runs, isLoading } = useQuery({ queryKey: ["payroll-runs"], queryFn: payrollApi.listRuns });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <AppButton onClick={() => setShowForm(true)}>+ New run</AppButton>
      </div>

      {isLoading ? (
        <TableShell><TableSkeleton rows={3} cols={6} /></TableShell>
      ) : !runs || runs.length === 0 ? (
        <EmptyState title="No payroll runs yet" message="Create a run for a cutoff, then compute it." action={<AppButton onClick={() => setShowForm(true)}>+ New run</AppButton>} />
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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {runs.map((r) => (
                <tr key={r.id} onClick={() => router.push(`/payroll/${r.id}`)} className="cursor-pointer hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{r.name}</td>
                  <td className="px-4 py-3 text-slate-600">{r.period_start} → {r.period_end}</td>
                  <td className="px-4 py-3 text-slate-600">{r.pay_date}</td>
                  <td className="px-4 py-3"><StatusChip status={r.status} /></td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.payslip_count ?? 0}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{peso(r.total_net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      )}

      {showForm && (
        <NewRunModal
          onClose={() => setShowForm(false)}
          onCreated={(run) => {
            qc.invalidateQueries({ queryKey: ["payroll-runs"] });
            setShowForm(false);
            router.push(`/payroll/${run.id}`);
          }}
        />
      )}
    </div>
  );
}

function NewRunModal({ onClose, onCreated }: { onClose: () => void; onCreated: (r: PayrollRun) => void }) {
  const [form, setForm] = useState<NewRunInput>({ name: "", period_start: "", period_end: "", pay_date: "" });
  const set = <K extends keyof NewRunInput>(k: K, v: NewRunInput[K]) => setForm({ ...form, [k]: v });

  const create = useMutation({
    mutationFn: () => payrollApi.createRun(form),
    meta: { successMessage: "Payroll run created." },
    onSuccess: onCreated,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">New payroll run</h2>
        <form className="mt-4 space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <div>
            <label className={labelCls}>Run name</label>
            <input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="June 2026 (2nd cutoff)" required />
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

function CompensationTab() {
  const qc = useQueryClient();
  const { data: rows, isLoading } = useQuery({ queryKey: ["compensations"], queryFn: compensationApi.list });
  const [edits, setEdits] = useState<Record<number, { basic: string; allowance: string }>>({});

  const save = useMutation({
    mutationFn: (r: CompRow) => {
      const e = edits[r.employee_id];
      return compensationApi.save({
        employee_id: r.employee_id,
        basic_monthly: Number(e?.basic ?? r.basic_monthly ?? 0),
        allowance_monthly: Number(e?.allowance ?? r.allowance_monthly ?? 0),
      });
    },
    onSuccess: () => {
      toast.success("Compensation saved.");
      qc.invalidateQueries({ queryKey: ["compensations"] });
    },
  });

  if (isLoading) return <TableShell><TableSkeleton rows={6} cols={4} /></TableShell>;
  if (!rows || rows.length === 0) return <EmptyState title="No employees" message="Add employees first." />;

  return (
    <TableShell>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3">Employee</th>
            <th className="px-4 py-3">Department</th>
            <th className="px-4 py-3">Basic / month</th>
            <th className="px-4 py-3">Allowance / month</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => {
            const e = edits[r.employee_id];
            return (
              <tr key={r.employee_id} className="hover:bg-slate-50/60">
                <td className="px-4 py-2.5">
                  <div className="font-medium text-slate-800">{r.name}</div>
                  <div className="font-mono text-xs text-slate-400">{r.employee_no}</div>
                </td>
                <td className="px-4 py-2.5 text-slate-600">{r.department ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <input
                    type="number" min={0} step="0.01"
                    className="w-32 rounded-lg border border-slate-200 px-2 py-1 text-sm tabular-nums"
                    value={e?.basic ?? (r.basic_monthly != null ? String(r.basic_monthly) : "")}
                    onChange={(ev) => setEdits({ ...edits, [r.employee_id]: { basic: ev.target.value, allowance: e?.allowance ?? (r.allowance_monthly != null ? String(r.allowance_monthly) : "0") } })}
                    placeholder="0.00"
                  />
                </td>
                <td className="px-4 py-2.5">
                  <input
                    type="number" min={0} step="0.01"
                    className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-sm tabular-nums"
                    value={e?.allowance ?? (r.allowance_monthly != null ? String(r.allowance_monthly) : "")}
                    onChange={(ev) => setEdits({ ...edits, [r.employee_id]: { basic: e?.basic ?? (r.basic_monthly != null ? String(r.basic_monthly) : "0"), allowance: ev.target.value } })}
                    placeholder="0.00"
                  />
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    onClick={() => save.mutate(r)}
                    disabled={save.isPending}
                    className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
                  >
                    Save
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableShell>
  );
}
