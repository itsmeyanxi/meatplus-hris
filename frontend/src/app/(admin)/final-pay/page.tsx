"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import {
  finalPayApi,
  SEPARATION_TYPES,
  type DeductionRow,
  type EarningsRow,
  type SeparationType,
} from "@/lib/final-pay";
import { listEmployees, type EmployeeListItem } from "@/lib/employees";

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

// ── amount input ──────────────────────────────────────────────────────────

function AmountInput({ value, onChange, placeholder = "0.00" }: {
  value: number; onChange: (v: number) => void; placeholder?: string;
}) {
  return (
    <input
      type="number" min={0} step="0.01"
      value={value === 0 ? "" : value}
      placeholder={placeholder}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      className="w-36 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-right text-sm font-medium outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 tabular-nums"
    />
  );
}

// ── employee picker ───────────────────────────────────────────────────────

function EmployeePicker({ value, onChange }: {
  value: EmployeeListItem | null;
  onChange: (e: EmployeeListItem | null) => void;
}) {
  const [q, setQ]           = useState(value ? `${value.full_name} (${value.employee_no})` : "");
  const [open, setOpen]     = useState(false);

  const { data: page } = useQuery({
    queryKey: ["employees", { q, perPage: 10 }],
    queryFn:  () => listEmployees({ q, perPage: 10 }),
    enabled:  q.length >= 2 && !value,
    staleTime: 10_000,
  });

  const cls = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100";

  return (
    <div className="relative">
      <input
        type="text" className={cls}
        placeholder="Search by name or employee no…"
        value={q}
        onChange={(e) => { setQ(e.target.value); onChange(null); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && !value && page?.data && page.data.length > 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {page.data.map((e) => (
            <button key={e.id} type="button"
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => { onChange(e); setQ(`${e.full_name} (${e.employee_no})`); setOpen(false); }}>
              <span className="font-medium text-slate-800">{e.full_name}</span>
              <span className="ml-auto text-xs text-slate-400">{e.employee_no}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── main form ─────────────────────────────────────────────────────────────

function NewFinalPayForm({ onSaved }: { onSaved: (id: number) => void }) {
  const qc = useQueryClient();

  const [employee,    setEmployee]  = useState<EmployeeListItem | null>(null);
  const [lastDay,     setLastDay]   = useState("");
  const [sepType,     setSepType]   = useState<SeparationType>("resigned");
  const [monthly,     setMonthly]   = useState<number>(0);
  const [earnings,    setEarnings]  = useState<EarningsRow[]>([{ label: "", amount: 0 }]);
  const [deductions,  setDeds]      = useState<DeductionRow[]>([]);
  const [notes,       setNotes]     = useState("");

  const dailyRate = monthly > 0 ? monthly / 22 : 0;

  // earnings
  const addEarning    = () => setEarnings((r) => [...r, { label: "", amount: 0 }]);
  const removeEarning = (i: number) => setEarnings((r) => r.filter((_, idx) => idx !== i));
  const patchEarning  = (i: number, patch: Partial<EarningsRow>) =>
    setEarnings((r) => r.map((row, idx) => idx === i ? { ...row, ...patch } : row));

  // deductions
  const addDed    = () => setDeds((r) => [...r, { label: "", amount: 0 }]);
  const removeDed = (i: number) => setDeds((r) => r.filter((_, idx) => idx !== i));
  const patchDed  = (i: number, patch: Partial<DeductionRow>) =>
    setDeds((r) => r.map((row, idx) => idx === i ? { ...row, ...patch } : row));

  const totalEarnings   = earnings.reduce((s, r) => s + r.amount, 0);
  const totalDeductions = deductions.reduce((s, r) => s + r.amount, 0);
  const netPay          = totalEarnings - totalDeductions;

  const save = useMutation({
    mutationFn: (status: "draft" | "finalized") => finalPayApi.store({
      employee_id:         employee!.id,
      last_working_day:    lastDay,
      separation_type:     sepType,
      basic_monthly:       monthly,
      daily_rate:          dailyRate,
      earnings_breakdown:  earnings,
      deductions_breakdown: deductions,
      notes,
      status,
    }),
    onSuccess: (rec) => { qc.invalidateQueries({ queryKey: ["final-pays"] }); onSaved(rec.id); },
  });

  const inputCls = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100";
  const labelCls = "flex-1 min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100";

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-5">
      {/* Basic info */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-semibold text-slate-800">Basic Information</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-600">Employee</label>
            <EmployeePicker value={employee} onChange={setEmployee} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Last Working Day</label>
            <input type="date" className={inputCls} value={lastDay} onChange={(e) => setLastDay(e.target.value)} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Separation Type</label>
            <select className={inputCls} value={sepType} onChange={(e) => setSepType(e.target.value as SeparationType)}>
              {SEPARATION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Monthly Salary</label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">₱</span>
              <input type="number" min={0} step="0.01" placeholder="0.00"
                value={monthly === 0 ? "" : monthly}
                onChange={(e) => setMonthly(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-slate-200 bg-white pl-7 pr-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100" />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Daily Rate (÷22)</label>
            <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 tabular-nums">
              {dailyRate > 0 ? php(dailyRate) : <span className="text-slate-400">auto-computed</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Earnings */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
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
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 w-44">Amount</th>
              <th className="pr-4 py-2.5 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {earnings.map((row, i) => (
              <tr key={i} className="group">
                <td className="pl-5 pr-3 py-2.5">
                  <input className={labelCls} value={row.label} placeholder="e.g. Salary (15 days), SIL, 13th Month…"
                    onChange={(e) => patchEarning(i, { label: e.target.value })} />
                </td>
                <td className="px-3 py-2.5 text-right">
                  <AmountInput value={row.amount} onChange={(v) => patchEarning(i, { amount: v })} />
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

      {/* Deductions */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-800">Deductions</h3>
          <button type="button" onClick={addDed}
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
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 w-44">Amount</th>
                <th className="pr-4 py-2.5 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {deductions.map((row, i) => (
                <tr key={i} className="group">
                  <td className="pl-5 pr-3 py-2.5">
                    <input className={labelCls} value={row.label} placeholder="e.g. Salary Loan, SSS…"
                      onChange={(e) => patchDed(i, { label: e.target.value })} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <AmountInput value={row.amount} onChange={(v) => patchDed(i, { amount: v })} />
                  </td>
                  <td className="pr-4 py-2.5">
                    <button type="button" onClick={() => removeDed(i)}
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

      {/* Net pay */}
      <div className="overflow-hidden rounded-2xl border-2 border-emerald-200 bg-emerald-50">
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
          <div className="border-t border-emerald-200 pt-2 flex items-center justify-between">
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
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">Failed to save. Please check all fields and try again.</p>
      )}

      <div className="flex items-center gap-3">
        <button onClick={() => save.mutate("finalized")}
          disabled={!employee || !lastDay || save.isPending}
          className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition">
          {save.isPending ? "Saving…" : "Save & Finalize"}
        </button>
        <button onClick={() => save.mutate("draft")}
          disabled={!employee || !lastDay || save.isPending}
          className="rounded-lg border border-slate-200 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition">
          Save as Draft
        </button>
      </div>
    </form>
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
    <p className="py-10 text-center text-sm text-slate-400">No records yet. Click <strong>New</strong> to get started.</p>
  );

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[560px]">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            {["Employee", "Last Day", "Type", "Net Final Pay", "Status", ""].map((h, i) => (
              <th key={h} className={`px-4 py-3 text-xs font-semibold text-slate-600 ${i === 5 ? "pr-4 text-right" : "text-left"} ${i === 0 ? "pl-5" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {records.map((r) => {
            const name = r.employee ? `${r.employee.first_name} ${r.employee.last_name}` : `#${r.employee_id}`;
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
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
                    r.status === "finalized"
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                      : "bg-amber-50 text-amber-700 ring-amber-200"
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
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Final Pay</h1>
          <p className="mt-0.5 text-sm text-slate-500">Compute and record employee final pay upon separation.</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-700 transition">
          {showForm ? "← Back to list" : (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New
            </>
          )}
        </button>
      </div>

      {showForm
        ? <NewFinalPayForm onSaved={(id) => window.location.assign(`/final-pay/${id}`)} />
        : <RecordsList />
      }
    </div>
  );
}
