"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import {
  finalPayApi,
  SEPARATION_TYPES,
  type DeductionRow,
  type EarningsRow,
  type FinalPayComputed,
  type SeparationType,
} from "@/lib/final-pay";
import { listEmployees } from "@/lib/employees";

// ── helpers ───────────────────────────────────────────────────────────────

const php = (n: number | string) =>
  "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  return new Date(s + "T00:00:00").toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
};

const SEP_LABELS: Record<string, string> = Object.fromEntries(
  SEPARATION_TYPES.map((t) => [t.value, t.label])
);

// ── step 1: basic info form ───────────────────────────────────────────────

function Step1Form({ onResult }: { onResult: (r: FinalPayComputed) => void }) {
  const [empSearch, setSearch]        = useState("");
  const [selId, setSelId]             = useState<number | null>(null);
  const [selName, setSelName]         = useState("");
  const [showSug, setShowSug]         = useState(false);
  const [lastDay, setLastDay]         = useState("");
  const [sepType, setSepType]         = useState<SeparationType>("resigned");
  const [daysWorked, setDaysWorked]   = useState<number>(0);

  const { data: empPage } = useQuery({
    queryKey: ["employees", { q: empSearch, perPage: 10 }],
    queryFn:  () => listEmployees({ q: empSearch, perPage: 10 }),
    enabled:  empSearch.length >= 2,
    staleTime: 10_000,
  });

  const compute = useMutation({
    mutationFn: () => finalPayApi.compute({
      employee_id:             selId!,
      last_working_day:        lastDay,
      separation_type:         sepType,
      days_worked_last_period: daysWorked,
    }),
    onSuccess: onResult,
  });

  const cls = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100";

  return (
    <form onSubmit={(e) => { e.preventDefault(); compute.mutate(); }}
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
      <div>
        <h3 className="text-base font-semibold text-slate-800">Employee Information</h3>
        <p className="text-sm text-slate-500 mt-0.5">Fill in the basic details to generate the final pay breakdown.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Employee picker */}
        <div className="relative sm:col-span-2">
          <label className="mb-1 block text-xs font-semibold text-slate-600">Employee</label>
          <input
            type="text"
            className={cls}
            placeholder="Search by name or employee no…"
            value={selId ? selName : empSearch}
            onChange={(e) => { setSearch(e.target.value); setSelId(null); setSelName(""); setShowSug(true); }}
            onFocus={() => setShowSug(true)}
          />
          {showSug && !selId && empPage?.data && empPage.data.length > 0 && (
            <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
              {empPage.data.map((e) => (
                <button key={e.id} type="button"
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
                  onClick={() => { setSelId(e.id); setSelName(`${e.full_name} (${e.employee_no})`); setShowSug(false); }}>
                  <span className="font-medium text-slate-800">{e.full_name}</span>
                  <span className="ml-auto text-xs text-slate-400">{e.employee_no}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Last Working Day</label>
          <input type="date" className={cls} value={lastDay} onChange={(e) => setLastDay(e.target.value)} required />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Separation Type</label>
          <select className={cls} value={sepType} onChange={(e) => setSepType(e.target.value as SeparationType)}>
            {SEPARATION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Days Worked in Last Pay Period</label>
          <input type="number" className={cls} min={0} max={31} value={daysWorked}
            onChange={(e) => setDaysWorked(Number(e.target.value))} required />
        </div>
      </div>

      {compute.isError && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">Failed to compute. Check the inputs and try again.</p>
      )}

      <button type="submit" disabled={!selId || !lastDay || compute.isPending}
        className="rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-700 disabled:opacity-50 transition">
        {compute.isPending ? "Computing…" : "Generate Final Pay →"}
      </button>
    </form>
  );
}

// ── step 2: editable breakdown ────────────────────────────────────────────

function AmountInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input type="number" min={0} step="0.01" value={value === 0 ? "" : value}
      placeholder="0.00"
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      className="w-36 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-right text-sm font-medium outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 tabular-nums" />
  );
}

function BreakdownEditor({ computed, onSaved, onReset }: {
  computed: FinalPayComputed;
  onSaved: (id: number) => void;
  onReset: () => void;
}) {
  const qc = useQueryClient();

  // Build initial earnings rows from computed data
  const makeInitialEarnings = (): EarningsRow[] => {
    const rows: EarningsRow[] = [
      {
        label: `Salary (${computed.days_worked_last_period} days)`,
        days:  computed.days_worked_last_period,
        amount: computed.unpaid_salary,
      },
      ...computed.leave_items.map((l) => ({
        label:  `${l.days} ${l.label}`,
        days:   l.days,
        amount: l.amount,
      })),
      { label: "13th Month Pay", amount: computed.suggested_13th_month },
    ];
    if (computed.separation_pay > 0) {
      rows.push({ label: "Separation Pay", amount: computed.separation_pay });
    }
    return rows;
  };

  const [earnings, setEarnings]       = useState<EarningsRow[]>(makeInitialEarnings);
  const [deductions, setDeductions]   = useState<DeductionRow[]>([]);
  const [notes, setNotes]             = useState("");

  // ── earnings helpers ──────────────────────────────────────────────────
  const addEarning  = () => setEarnings((r) => [...r, { label: "", amount: 0 }]);
  const removeEarning = (i: number) => setEarnings((r) => r.filter((_, idx) => idx !== i));
  const updateEarning = (i: number, patch: Partial<EarningsRow>) =>
    setEarnings((r) => r.map((row, idx) => idx === i ? { ...row, ...patch } : row));

  // ── deductions helpers ────────────────────────────────────────────────
  const addDeduction    = () => setDeductions((r) => [...r, { label: "", amount: 0 }]);
  const removeDeduction = (i: number) => setDeductions((r) => r.filter((_, idx) => idx !== i));
  const updateDeduction = (i: number, patch: Partial<DeductionRow>) =>
    setDeductions((r) => r.map((row, idx) => idx === i ? { ...row, ...patch } : row));

  const totalEarnings   = earnings.reduce((s, r) => s + r.amount, 0);
  const totalDeductions = deductions.reduce((s, r) => s + r.amount, 0);
  const netPay          = totalEarnings - totalDeductions;

  const totalLeaveConversion = earnings
    .filter((r) => computed.leave_items.some((l) => r.label.includes(l.label)))
    .reduce((s, r) => s + r.amount, 0);
  const totalLeavedays = earnings
    .filter((r) => computed.leave_items.some((l) => r.label.includes(l.label)))
    .reduce((s, r) => s + (r.days ?? 0), 0);

  const save = useMutation({
    mutationFn: (status: "draft" | "finalized") => finalPayApi.store({
      employee_id:             computed.employee.id,
      last_working_day:        computed.last_working_day,
      separation_type:         computed.separation_type,
      basic_monthly:           computed.basic_monthly,
      daily_rate:              computed.daily_rate,
      days_worked_last_period: computed.days_worked_last_period,
      years_of_service:        computed.years_of_service,
      unpaid_salary:           earnings[0]?.amount ?? 0,
      thirteenth_month_pay:    earnings.find((r) => r.label === "13th Month Pay")?.amount ?? 0,
      leave_conversion:        totalLeaveConversion,
      unused_leave_days:       totalLeavedays,
      separation_pay:          earnings.find((r) => r.label === "Separation Pay")?.amount ?? 0,
      other_earnings:          0,
      earnings_breakdown:      earnings,
      deductions_breakdown:    deductions,
      notes,
      status,
    }),
    onSuccess: (record) => { qc.invalidateQueries({ queryKey: ["final-pays"] }); onSaved(record.id); },
  });

  const labelCls = "flex-1 min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100";

  return (
    <div className="space-y-5">
      {/* Banner */}
      <div className="flex items-start justify-between rounded-2xl bg-slate-900 px-5 py-4 text-white">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-slate-400">Final Pay Computation</p>
          <p className="mt-0.5 text-lg font-bold">{computed.employee.full_name}</p>
          <p className="text-sm text-slate-400">
            {computed.employee.employee_no} · {SEP_LABELS[computed.separation_type]} · Last day: {fmtDate(computed.last_working_day)}
          </p>
        </div>
        <button onClick={onReset}
          className="shrink-0 rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10 transition">
          ← New
        </button>
      </div>

      {/* Info strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Monthly Salary",  value: php(computed.basic_monthly) },
          { label: "Daily Rate (÷22)", value: php(computed.daily_rate) },
          { label: "Years of Service", value: `${Number(computed.years_of_service).toFixed(2)} yrs` },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center">
            <p className="text-xs text-slate-500">{c.label}</p>
            <p className="mt-0.5 text-base font-bold text-slate-900 tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Earnings table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-800">Earnings</h3>
          <button type="button" onClick={addEarning}
            className="text-xs font-medium text-sky-600 hover:text-sky-800 transition">
            + Add row
          </button>
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="pl-5 pr-3 py-2.5 text-left text-xs font-semibold text-slate-500 w-full">Description</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 w-48">Amount</th>
              <th className="pr-4 py-2.5 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {earnings.map((row, i) => (
              <tr key={i} className="group">
                <td className="pl-5 pr-3 py-2.5">
                  <input
                    className={labelCls}
                    value={row.label}
                    placeholder="Description…"
                    onChange={(e) => updateEarning(i, { label: e.target.value })}
                  />
                </td>
                <td className="px-3 py-2.5 text-right">
                  <AmountInput value={row.amount} onChange={(v) => updateEarning(i, { amount: v })} />
                </td>
                <td className="pr-4 py-2.5">
                  <button type="button" onClick={() => removeEarning(i)}
                    className="text-slate-300 hover:text-red-400 transition opacity-0 group-hover:opacity-100">
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50">
              <td className="pl-5 pr-3 py-3 text-sm font-semibold text-slate-700">Total Earnings</td>
              <td className="px-3 py-3 text-right text-sm font-bold text-slate-900 tabular-nums">{php(totalEarnings)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Deductions table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-800">Deductions</h3>
          <button type="button" onClick={addDeduction}
            className="text-xs font-medium text-sky-600 hover:text-sky-800 transition">
            + Add row
          </button>
        </div>

        {deductions.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-400 text-center">
            No deductions. Click <span className="font-medium">+ Add row</span> to add one.
          </p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="pl-5 pr-3 py-2.5 text-left text-xs font-semibold text-slate-500 w-full">Description</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 w-48">Amount</th>
                <th className="pr-4 py-2.5 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {deductions.map((row, i) => (
                <tr key={i} className="group">
                  <td className="pl-5 pr-3 py-2.5">
                    <input
                      className={labelCls}
                      value={row.label}
                      placeholder="e.g. Salary Loan, SSS…"
                      onChange={(e) => updateDeduction(i, { label: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <AmountInput value={row.amount} onChange={(v) => updateDeduction(i, { amount: v })} />
                  </td>
                  <td className="pr-4 py-2.5">
                    <button type="button" onClick={() => removeDeduction(i)}
                      className="text-slate-300 hover:text-red-400 transition opacity-0 group-hover:opacity-100">
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td className="pl-5 pr-3 py-3 text-sm font-semibold text-slate-700">Total Deductions</td>
                <td className="px-3 py-3 text-right text-sm font-bold text-red-600 tabular-nums">{php(totalDeductions)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Final pay summary */}
      <div className="overflow-hidden rounded-2xl border-2 border-emerald-200 bg-emerald-50">
        <div className="px-5 py-3 border-b border-emerald-100">
          <h3 className="text-sm font-semibold text-emerald-800">Final Pay</h3>
        </div>
        <div className="px-5 py-4 space-y-1.5 font-mono text-sm">
          <div className="flex justify-between text-slate-600">
            <span>Total Earnings</span>
            <span className="tabular-nums">{php(totalEarnings)}</span>
          </div>
          {totalDeductions > 0 && (
            <div className="flex justify-between text-red-600">
              <span>− Total Deductions</span>
              <span className="tabular-nums">{php(totalDeductions)}</span>
            </div>
          )}
          <div className="border-t border-emerald-200 pt-2 flex justify-between items-center">
            <span className="text-base font-bold text-emerald-800">Net Final Pay</span>
            <span className="text-2xl font-bold text-emerald-700 tabular-nums">{php(netPay)}</span>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-600">Notes (optional)</label>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
          placeholder="Internal HR notes…" />
      </div>

      {save.isError && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">Failed to save. Please try again.</p>
      )}

      <div className="flex items-center gap-3">
        <button onClick={() => save.mutate("finalized")} disabled={save.isPending}
          className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition">
          {save.isPending ? "Saving…" : "Save & Finalize"}
        </button>
        <button onClick={() => save.mutate("draft")} disabled={save.isPending}
          className="rounded-lg border border-slate-200 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition">
          Save as Draft
        </button>
      </div>
    </div>
  );
}

// ── records list ──────────────────────────────────────────────────────────

function RecordsList() {
  const { data: records = [], isLoading } = useQuery({
    queryKey: ["final-pays"],
    queryFn:  finalPayApi.list,
    staleTime: 30_000,
  });

  if (isLoading) return <p className="py-6 text-center text-sm text-slate-400">Loading…</p>;
  if (records.length === 0) return (
    <p className="py-10 text-center text-sm text-slate-400">No final pay records yet. Click <strong>New Computation</strong> to get started.</p>
  );

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[580px]">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            {["Employee", "Last Day", "Type", "Net Final Pay", "Status", ""].map((h, i) => (
              <th key={h} className={`px-4 py-3 text-xs font-semibold text-slate-600 ${i === 5 ? "pr-4 text-right" : "text-left"} ${i === 0 ? "pl-5" : ""}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {records.map((r) => {
            const name = r.employee
              ? `${r.employee.first_name} ${r.employee.last_name}`
              : `#${r.employee_id}`;
            return (
              <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                <td className="pl-5 pr-4 py-3">
                  <p className="text-sm font-medium text-slate-800">{name}</p>
                  <p className="text-xs text-slate-400">{r.employee?.employee_no}</p>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">{fmtDate(r.last_working_day)}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{SEP_LABELS[r.separation_type] ?? r.separation_type}</td>
                <td className="px-4 py-3 text-sm font-bold text-emerald-700 tabular-nums">{php(r.net_final_pay)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    r.status === "finalized"
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                      : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                  }`}>
                    {r.status === "finalized" ? "Finalized" : "Draft"}
                  </span>
                </td>
                <td className="pl-4 pr-4 py-3 text-right">
                  <Link href={`/final-pay/${r.id}`}
                    className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 transition">
                    View
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────

export default function FinalPayPage() {
  const [computed, setComputed] = useState<FinalPayComputed | null>(null);
  const [showForm, setShowForm] = useState(false);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Final Pay</h1>
          <p className="mt-0.5 text-sm text-slate-500">Compute and record employee final pay upon separation.</p>
        </div>
        {!showForm && !computed && (
          <button onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-700 transition">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Computation
          </button>
        )}
      </div>

      {showForm && !computed && (
        <Step1Form onResult={(r) => { setComputed(r); setShowForm(false); }} />
      )}

      {computed && (
        <BreakdownEditor
          computed={computed}
          onSaved={(id) => { setComputed(null); window.location.assign(`/final-pay/${id}`); }}
          onReset={() => setComputed(null)}
        />
      )}

      {!computed && !showForm && (
        <>
          <h2 className="text-sm font-semibold text-slate-700">Saved Records</h2>
          <RecordsList />
        </>
      )}
    </div>
  );
}
