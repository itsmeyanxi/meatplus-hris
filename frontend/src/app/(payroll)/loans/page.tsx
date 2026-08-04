"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader, AppButton, AppCard, AppInput, TableShell } from "@/components/ui";
import { EmployeeSearchSelect } from "@/components/EmployeeSearchSelect";
import { SearchSelect } from "@/components/SearchSelect";
import { ImportDataButton } from "@/components/ImportDataButton";
import { getMe } from "@/lib/auth";
import { loansApi, peso, LOAN_TYPES, type LoanInput } from "@/lib/payroll";
import { inputCls, labelCls } from "@/lib/form-classes";

const typeLabel = (v: string) => LOAN_TYPES.find((t) => t.value === v)?.label ?? v;

const TYPE_BADGE: Record<string, string> = {
  sss_salary: "bg-sky-50 text-sky-700 ring-sky-200",
  sss_calamity: "bg-sky-50 text-sky-700 ring-sky-200",
  pagibig_mpl: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  pagibig_calamity: "bg-brand-50 text-brand-700 ring-brand-200",
  cash_advance: "bg-amber-50 text-amber-700 ring-amber-200",
  company: "bg-violet-50 text-violet-700 ring-violet-200",
  other: "bg-slate-100 text-slate-600 ring-slate-200",
};

export default function LoansPage() {
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const canManage = me?.user.permissions?.includes("payroll.run") ?? false;

  const [activeOnly, setActiveOnly] = useState(true);
  const { data: loans = [], isLoading } = useQuery({
    queryKey: ["loans", { activeOnly }],
    queryFn: () => loansApi.list({ active_only: activeOnly }),
  });

  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return loans.filter((l) => {
      if (typeFilter && l.type !== typeFilter) return false;
      if (!needle) return true;
      return (
        (l.employee?.name ?? "").toLowerCase().includes(needle) ||
        (l.employee?.employee_no ?? "").toLowerCase().includes(needle) ||
        (l.reference_no ?? "").toLowerCase().includes(needle)
      );
    });
  }, [loans, q, typeFilter]);

  const stats = useMemo(() => {
    const active = loans.filter((l) => l.is_active && l.outstanding_balance > 0);
    return {
      activeCount: active.length,
      outstanding: active.reduce((s, l) => s + Number(l.outstanding_balance), 0),
      perCutoff: active.reduce((s, l) => s + Number(l.amortization), 0),
      employees: new Set(active.map((l) => l.employee?.employee_no)).size,
    };
  }, [loans]);

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<LoanInput>({ employee_id: 0, type: "cash_advance", amortization: 0, principal: undefined, reference_no: "" });

  const reset = () => { setForm({ employee_id: 0, type: "cash_advance", amortization: 0, principal: undefined, reference_no: "" }); setAdding(false); };
  const invalidate = () => qc.invalidateQueries({ queryKey: ["loans"] });

  const create = useMutation({
    mutationFn: () => loansApi.create(form),
    onSuccess: () => { toast.success("Loan added."); reset(); invalidate(); },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } };
      toast.error(err?.response?.data?.errors ? Object.values(err.response.data.errors).flat().join(" ") : err?.response?.data?.message ?? "Failed.");
    },
  });
  const toggle = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) => loansApi.update(id, { is_active }),
    onSuccess: () => invalidate(),
  });
  const remove = useMutation({
    mutationFn: (id: number) => loansApi.remove(id),
    onSuccess: () => { toast.success("Loan deleted."); invalidate(); },
  });

  const canSubmit = form.employee_id > 0 && form.type && Number(form.amortization) > 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Loans & Deductions"
        description="Recurring amortized deductions (SSS/Pag-IBIG loans, cash advances, company loans). Each cutoff deducts the amortization; the balance draws down when a run is posted."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <a href={loansApi.exportUrl} className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
              Export
            </a>
            {canManage && (
              <ImportDataButton
                label="Import loans"
                title="Import loans (SSS / Pag-IBIG schedule)"
                description="Upload an SSS/Pag-IBIG loan schedule or any loan list. Matches employees by ID; re-importing the same loan refreshes its amortization + balance."
                columns="EmployeeID · LoanType · ReferenceNo · Principal · Amortization · OutstandingBalance · StartDate"
                templateUrl={loansApi.importTemplateUrl}
                importFn={loansApi.import}
                invalidateKeys={[["loans"]]}
              />
            )}
            {canManage && (
              <AppButton variant={adding ? "secondary" : "primary"} onClick={() => (adding ? reset() : setAdding(true))}>
                {adding ? "Cancel" : "+ New loan"}
              </AppButton>
            )}
          </div>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active loans" value={String(stats.activeCount)} tone="slate" />
        <Stat label="Total outstanding" value={peso(stats.outstanding)} tone="rose" />
        <Stat label="Per-cutoff deduction" value={peso(stats.perCutoff)} tone="sky" />
        <Stat label="Employees" value={String(stats.employees)} tone="emerald" />
      </div>

      {adding && canManage && (
        <AppCard title="New loan / deduction">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <label className={labelCls}>Employee *</label>
              <EmployeeSearchSelect className={inputCls} value={form.employee_id || ""} onChange={(id) => setForm({ ...form, employee_id: id === "" ? 0 : Number(id) })} placeholder="Search…" />
            </div>
            <div>
              <label className={labelCls}>Type *</label>
              <SearchSelect className={inputCls} value={form.type} onChange={(v) => setForm({ ...form, type: v })} options={LOAN_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
            </div>
            <div>
              <label className={labelCls}>Reference no.</label>
              <input className={inputCls} value={form.reference_no ?? ""} onChange={(e) => setForm({ ...form, reference_no: e.target.value })} placeholder="optional" />
            </div>
            <div>
              <label className={labelCls}>Principal / total</label>
              <input type="number" min="0" step="0.01" className={inputCls} value={form.principal ?? ""} onChange={(e) => setForm({ ...form, principal: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder="0.00" />
            </div>
            <div>
              <label className={labelCls}>Amortization / cutoff *</label>
              <input type="number" min="0" step="0.01" className={inputCls} value={form.amortization || ""} onChange={(e) => setForm({ ...form, amortization: Number(e.target.value) })} placeholder="0.00" />
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-400">Outstanding balance defaults to the principal. It reduces automatically each time a payroll run that deducted it is posted.</p>
          <div className="mt-3 flex justify-end">
            <AppButton onClick={() => create.mutate()} disabled={!canSubmit || create.isPending}>{create.isPending ? "Saving…" : "Add loan"}</AppButton>
          </div>
        </AppCard>
      )}

      {/* Toolbar: search + type filter + active/all */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-64">
          <AppInput placeholder="Search name, ID or reference…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className={`${inputCls} w-auto`} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          {LOAN_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setActiveOnly(true)} className={activeOnly ? pillOn : pillOff}>Active</button>
          <button onClick={() => setActiveOnly(false)} className={!activeOnly ? pillOn : pillOff}>All</button>
        </div>
      </div>

      <TableShell>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Reference</th>
                <th className="whitespace-nowrap px-4 py-3">Start date</th>
                <th className="whitespace-nowrap px-4 py-3 text-right">Amort / cutoff</th>
                <th className="px-4 py-3">Balance</th>
                <th className="px-4 py-3 text-center">Status</th>
                {canManage && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (<tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">Loading…</td></tr>)}
              {!isLoading && rows.length === 0 && (<tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-500">{loans.length === 0 ? "No loans." : "No loans match your filters."}</td></tr>)}
              {rows.map((l) => {
                const principal = Number(l.principal) || 0;
                const outstanding = Number(l.outstanding_balance) || 0;
                const paid = Math.max(0, principal - outstanding);
                const pct = principal > 0 ? Math.min(100, Math.round((paid / principal) * 100)) : 0;
                return (
                  <tr key={l.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-800">{l.employee?.name ?? "—"}</div>
                      <div className="font-mono text-xs text-slate-400">{l.employee?.employee_no}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TYPE_BADGE[l.type] ?? TYPE_BADGE.other}`}>
                        {typeLabel(l.type)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{l.reference_no ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-slate-600">{l.start_date ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{peso(l.amortization)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold tabular-nums text-slate-900">{peso(outstanding)}</span>
                        {principal > 0 && <span className="text-[11px] text-slate-400">{pct}% paid</span>}
                      </div>
                      {principal > 0 && (
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${l.is_active && outstanding > 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {outstanding <= 0 ? "Paid" : l.is_active ? "Active" : "Paused"}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex justify-end gap-2">
                          {outstanding > 0 && (
                            <button onClick={() => toggle.mutate({ id: l.id, is_active: !l.is_active })} className="text-xs font-medium text-slate-600 hover:underline">
                              {l.is_active ? "Pause" : "Resume"}
                            </button>
                          )}
                          <button onClick={() => remove.mutate(l.id)} className="text-xs font-medium text-rose-600 hover:underline">Delete</button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50/60 text-sm font-semibold text-slate-700">
                  <td className="px-4 py-3" colSpan={4}>{rows.length} loan{rows.length === 1 ? "" : "s"} shown</td>
                  <td className="px-4 py-3 text-right tabular-nums">{peso(rows.reduce((s, l) => s + Number(l.amortization), 0))}</td>
                  <td className="px-4 py-3 tabular-nums">{peso(rows.reduce((s, l) => s + Number(l.outstanding_balance), 0))}</td>
                  <td className="px-4 py-3" colSpan={canManage ? 2 : 1} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </TableShell>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "slate" | "rose" | "sky" | "emerald" }) {
  const tones = {
    slate: "text-slate-900",
    rose: "text-rose-700",
    sky: "text-sky-700",
    emerald: "text-emerald-700",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`text-2xl font-bold tabular-nums ${tones[tone]}`}>{value}</div>
      <div className="mt-0.5 text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}

const pillOn = "rounded-full bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm";
const pillOff = "rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50";
