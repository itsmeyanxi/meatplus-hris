"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import axios from "axios";
import { SearchSelect } from "@/components/SearchSelect";
import { finalPayApi, SEPARATION_TYPES, type SeparationType } from "@/lib/final-pay";
import { listEmployees, type EmployeeListItem } from "@/lib/employees";

// ── predefined row structure ──────────────────────────────────────────────

const EARNINGS_DEF = [
  { key: "basic",           label: "Basic" },
  { key: "de_minimis",      label: "De Minimis" },
  { key: "13th_month",      label: "13th Month Pay" },
  { key: "overtime",        label: "Overtime",                sub: true },
  { key: "legal_hol",       label: "Legal Holiday",           sub: true },
  { key: "special_hol",     label: "Special Holiday",         sub: true },
  { key: "rest_day",        label: "Rest Day",                sub: true },
  { key: "legal_hol_rest",  label: "Legal Holiday Rest Day",  sub: true },
  { key: "spec_hol_rest",   label: "Spec. Holiday Rest Day",  sub: true },
  { key: "double_hol",      label: "Double Holiday",          sub: true },
  { key: "monetized_leave", label: "Monetized Leave" },
];

const DEDUCTIONS_DEF = [
  { key: "absence_basic",  label: "Absence / Tardiness (Basic)" },
  { key: "absence_dmis",   label: "Absences (De Minimis)" },
  { key: "sss_loan",       label: "SSS Loan" },
  { key: "hdmf_loan",      label: "HDMF Loan" },
  { key: "sss",            label: "SSS" },
  { key: "philhealth",     label: "Philhealth" },
  { key: "hdmf",           label: "HDMF" },
  { key: "tax_payable",    label: "Tax Payable (Refund)" },
];

type AmountsMap = Record<string, number>;
const zeroMap = (defs: { key: string }[]): AmountsMap =>
  Object.fromEntries(defs.map((d) => [d.key, 0]));

// ── helpers ───────────────────────────────────────────────────────────────

const fmt = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const php = (n: number | string | null | undefined) => "₱" + fmt(n);

const fmtDate = (s: string | null | undefined) => {
  if (!s) return "";
  return new Date(s + "T00:00:00").toLocaleDateString("en-PH", {
    year: "numeric", month: "short", day: "numeric",
  });
};

const SEP_LABELS: Record<string, string> = Object.fromEntries(
  SEPARATION_TYPES.map((t) => [t.value, t.label])
);

const STATUS_STYLE: Record<string, string> = {
  finalized: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  cancelled:  "bg-red-50 text-red-600 ring-red-200",
  draft:      "bg-amber-50 text-amber-700 ring-amber-200",
};
const STATUS_LABEL: Record<string, string> = {
  finalized: "Finalized", cancelled: "Cancelled", draft: "Draft",
};

// ── amount input ──────────────────────────────────────────────────────────

function AmountField({ value, onChange, placeholder = "0.00" }: {
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw]         = useState("");

  return (
    <div className="relative flex items-center">
      <span className="pointer-events-none absolute left-3 text-sm font-medium text-slate-400">₱</span>
      <input
        type="text"
        inputMode="decimal"
        placeholder={placeholder}
        value={focused ? raw : (value > 0 ? fmt(value) : "")}
        className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-7 pr-3 text-right text-sm tabular-nums outline-none placeholder:text-slate-300 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition"
        onFocus={() => { setFocused(true); setRaw(value > 0 ? String(value) : ""); }}
        onChange={(e) => {
          setRaw(e.target.value);
          const n = parseFloat(e.target.value);
          onChange(isNaN(n) || n < 0 ? 0 : n);
        }}
        onBlur={() => {
          setFocused(false);
          const n = parseFloat(raw);
          onChange(isNaN(n) || n < 0 ? 0 : n);
        }}
      />
    </div>
  );
}

// ── employee picker ───────────────────────────────────────────────────────

function EmployeePicker({ value, onChange }: {
  value: EmployeeListItem | null;
  onChange: (e: EmployeeListItem | null) => void;
}) {
  const [q, setQ]       = useState(value?.full_name ?? "");
  const [open, setOpen] = useState(false);

  const { data: page } = useQuery({
    queryKey: ["employees-fp", q],
    queryFn:  () => listEmployees({ q, perPage: 10 }),
    enabled:  q.length >= 2 && !value,
    staleTime: 10_000,
  });

  return (
    <div className="relative">
      <div className="relative">
        <svg className="pointer-events-none absolute inset-y-0 left-3 my-auto h-4 w-4 text-slate-400"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input type="text"
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
          placeholder="Search by name or employee ID…"
          value={q}
          onChange={(e) => { setQ(e.target.value); onChange(null); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {value && (
          <button type="button" onClick={() => { onChange(null); setQ(""); }}
            className="absolute inset-y-0 right-3 my-auto text-slate-300 hover:text-slate-500">✕</button>
        )}
      </div>
      {open && !value && page?.data && page.data.length > 0 && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          {page.data.map((e) => (
            <button key={e.id} type="button"
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors"
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => { onChange(e); setQ(e.full_name); setOpen(false); }}>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                {e.full_name.charAt(0)}
              </div>
              <div>
                <p className="text-sm font-medium text-slate-800">{e.full_name}</p>
                <p className="text-xs text-slate-400">{e.employee_no} · {e.department?.name ?? "—"}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── section header ────────────────────────────────────────────────────────

function SectionHeader({ label, total }: { label: string; total?: number }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-5 py-3">
      <span className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</span>
      {total !== undefined && (
        <span className={`text-sm font-bold tabular-nums ${total > 0 ? "text-slate-800" : "text-slate-300"}`}>
          {total > 0 ? php(total) : "₱ —"}
        </span>
      )}
    </div>
  );
}

// ── amount row (label + input) ────────────────────────────────────────────

function AmountRow({ label, sub, value, onChange }: {
  label: string;
  sub?: boolean;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="grid items-center gap-4 border-b border-slate-100 px-5 py-2.5 last:border-0 hover:bg-slate-50/40 transition-colors"
      style={{ gridTemplateColumns: "1fr 180px" }}>
      <span className={`text-sm ${sub ? "pl-5 text-slate-400" : "text-slate-700"}`}>
        {sub && <span className="mr-1.5 text-slate-300">—</span>}
        {label}
      </span>
      <AmountField value={value} onChange={onChange} />
    </div>
  );
}

// ── validation errors ─────────────────────────────────────────────────────

function getValidationErrors(err: unknown): string[] {
  if (!axios.isAxiosError(err)) return [];
  const data = err.response?.data as { errors?: Record<string, string[]> } | undefined;
  if (!data?.errors) return [];
  return Object.values(data.errors).flat();
}

// ── new final pay form ────────────────────────────────────────────────────

function NewFinalPayForm({ onSaved, onBack }: {
  onSaved: (id: number) => void;
  onBack: () => void;
}) {
  const qc = useQueryClient();

  const [employee,    setEmployee]  = useState<EmployeeListItem | null>(null);
  const [lastDay,     setLastDay]   = useState("");
  const [cutoffDate,  setCutoff]    = useState("");
  const [sepType,     setSepType]   = useState<SeparationType>("resigned");
  const [basicSalary, setBasic]     = useState(0);
  const [deMinis,     setDeMinis]   = useState(0);
  const [earnings,    setEarnings]  = useState<AmountsMap>(zeroMap(EARNINGS_DEF));
  const [deductions,  setDeductions]= useState<AmountsMap>(zeroMap(DEDUCTIONS_DEF));

  const patchE = (key: string, v: number) => setEarnings((p) => ({ ...p, [key]: v }));
  const patchD = (key: string, v: number) => setDeductions((p) => ({ ...p, [key]: v }));

  const totalEarnings   = EARNINGS_DEF.reduce((s, r) => s + (earnings[r.key] ?? 0), 0);
  const totalDeductions = DEDUCTIONS_DEF.reduce((s, r) => s + (deductions[r.key] ?? 0), 0);
  const netPay          = totalEarnings - totalDeductions;
  const dailyRate       = basicSalary > 0 ? Math.round((basicSalary / 22) * 10000) / 10000 : 0;

  const save = useMutation({
    mutationFn: (status: "draft" | "finalized") =>
      finalPayApi.store({
        employee_id:          employee!.id,
        last_working_day:     lastDay,
        separation_type:      sepType,
        basic_monthly:        basicSalary,
        daily_rate:           dailyRate,
        earnings_breakdown:   EARNINGS_DEF.map((r) => ({ label: r.label, amount: earnings[r.key] ?? 0 })),
        deductions_breakdown: DEDUCTIONS_DEF.map((r) => ({ label: r.label, amount: deductions[r.key] ?? 0 })),
        notes: cutoffDate ? `Payroll cut-off: ${cutoffDate}` : undefined,
        status,
      }),
    onSuccess: (rec) => { qc.invalidateQueries({ queryKey: ["final-pays"] }); onSaved(rec.id); },
  });

  const errors  = getValidationErrors(save.error);
  const canSave = !!employee && !!lastDay && !save.isPending;

  const selectCls = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100";

  return (
    <div className="space-y-5">
      <button onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to records
      </button>

      <div className="lg:grid lg:grid-cols-3 lg:gap-6 space-y-5 lg:space-y-0">

        {/* ── Left: Form ── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Basic Info */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <SectionHeader label="Employee Information" />
            <div className="space-y-4 p-5">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Employee</label>
                <EmployeePicker value={employee} onChange={setEmployee} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">End Date (Last Day)</label>
                  <input type="date" value={lastDay} onChange={(e) => setLastDay(e.target.value)}
                    className={selectCls} />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Payroll Cut-off Date</label>
                  <input type="date" value={cutoffDate} onChange={(e) => setCutoff(e.target.value)}
                    className={selectCls} />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Reason for Separation</label>
                  <SearchSelect
                    className={selectCls}
                    value={sepType}
                    onChange={(v) => setSepType(v as SeparationType)}
                    options={SEPARATION_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Basic Monthly Salary</label>
                  <AmountField value={basicSalary} onChange={setBasic} />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">De Minimis Benefits</label>
                  <AmountField value={deMinis} onChange={setDeMinis} />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Daily Rate (÷ 22)</label>
                  <div className="flex h-[42px] items-center rounded-xl border border-slate-100 bg-slate-50 px-3 text-sm font-semibold tabular-nums text-slate-700">
                    {dailyRate > 0 ? php(dailyRate) : <span className="font-normal text-slate-400">Auto from monthly</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Earnings */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <SectionHeader label="Earnings" total={totalEarnings} />
            {EARNINGS_DEF.map((row) => (
              <AmountRow
                key={row.key}
                label={row.label}
                sub={row.sub}
                value={earnings[row.key] ?? 0}
                onChange={(v) => patchE(row.key, v)}
              />
            ))}
            <div className="grid items-center gap-4 border-t-2 border-slate-200 bg-slate-50 px-5 py-3"
              style={{ gridTemplateColumns: "1fr 180px" }}>
              <span className="text-sm font-bold text-slate-800">Gross</span>
              <div className="text-right text-sm font-bold tabular-nums text-slate-900">
                {totalEarnings > 0 ? php(totalEarnings) : <span className="text-slate-300">₱ —</span>}
              </div>
            </div>
          </div>

          {/* Deductions */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <SectionHeader label="Deductions" total={totalDeductions} />
            {DEDUCTIONS_DEF.map((row) => (
              <AmountRow
                key={row.key}
                label={row.label}
                value={deductions[row.key] ?? 0}
                onChange={(v) => patchD(row.key, v)}
              />
            ))}
            <div className="grid items-center gap-4 border-t-2 border-slate-200 bg-slate-50 px-5 py-3"
              style={{ gridTemplateColumns: "1fr 180px" }}>
              <span className="text-sm font-bold text-slate-800">Total Deductions</span>
              <div className="text-right text-sm font-bold tabular-nums text-red-600">
                {totalDeductions > 0 ? `− ${php(totalDeductions)}` : <span className="text-slate-300">₱ —</span>}
              </div>
            </div>
          </div>

          {/* Error */}
          {save.isError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <p className="font-semibold">Could not save.</p>
              {errors.length > 0
                ? <ul className="mt-1 list-disc pl-4 space-y-0.5">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
                : <p>An unexpected error occurred.</p>
              }
            </div>
          )}
        </div>

        {/* ── Right: Summary ── */}
        <div className="lg:col-span-1">
          <div className="sticky top-6 space-y-4">

            {/* Employee card */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Employee</p>
              </div>
              {employee ? (
                <div className="flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">
                    {employee.full_name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{employee.full_name}</p>
                    <p className="text-xs text-slate-400">{employee.employee_no}</p>
                    {employee.date_hired && (
                      <p className="text-xs text-slate-400">Hired: {fmtDate(employee.date_hired)}</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="p-4 text-sm text-slate-400">No employee selected.</p>
              )}
            </div>

            {/* Net pay summary */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Summary</p>
              </div>
              <div className="p-4 space-y-2.5">
                {basicSalary > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-slate-50 p-2.5 text-center">
                      <p className="text-[10px] text-slate-400">Monthly</p>
                      <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-700">{php(basicSalary)}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2.5 text-center">
                      <p className="text-[10px] text-slate-400">Daily (÷22)</p>
                      <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-700">{php(dailyRate)}</p>
                    </div>
                  </div>
                )}
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Earnings</span>
                    <span className="tabular-nums font-medium text-slate-800">{php(totalEarnings)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Deductions</span>
                    <span className="tabular-nums font-medium text-red-600">
                      {totalDeductions > 0 ? `− ${php(totalDeductions)}` : "₱ —"}
                    </span>
                  </div>
                  <div className="border-t border-slate-100 pt-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Net Final Pay</p>
                    <p className={`text-2xl font-bold tabular-nums ${netPay >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {php(netPay)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Save buttons */}
            <div className="space-y-2">
              <button onClick={() => save.mutate("finalized")} disabled={!canSave}
                className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-40 transition">
                {save.isPending ? "Saving…" : "Save & Finalize"}
              </button>
              <button onClick={() => save.mutate("draft")} disabled={!canSave}
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition">
                Save as Draft
              </button>
            </div>
            {!canSave && !save.isPending && (
              <p className="text-center text-xs text-slate-400">
                {!employee ? "Select an employee first." : "Set the end date to continue."}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── records list ──────────────────────────────────────────────────────────

function RecordsList({ onNew }: { onNew: () => void }) {
  const qc = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (id: number) => finalPayApi.delete(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["final-pays"] }),
  });

  const { data: records, isLoading, isError } = useQuery({
    queryKey: ["final-pays"],
    queryFn:  finalPayApi.list,
    staleTime: 30_000,
  });

  if (isLoading) return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
      </svg>
      Loading…
    </div>
  );

  if (isError) return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
      Failed to load records.
    </div>
  );

  const finalized = records?.filter((r) => r.status === "finalized") ?? [];
  const drafts    = records?.filter((r) => r.status === "draft") ?? [];
  const totalNet  = finalized.reduce((s, r) => s + Number(r.net_final_pay), 0);

  if (!records || records.length === 0) return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
        <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <p className="text-sm font-medium text-slate-700">No final pay records yet</p>
      <p className="mt-1 text-xs text-slate-400">Click the button above to create one.</p>
      <button onClick={onNew}
        className="mt-4 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition">
        New Computation
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Records", value: String(records.length) },
          { label: "Finalized",     value: String(finalized.length) },
          { label: "Total Net Pay", value: php(totalNet) },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs text-slate-400">{s.label}</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{s.value}</p>
          </div>
        ))}
      </div>

      {drafts.length > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-700">
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {drafts.length} draft record{drafts.length > 1 ? "s" : ""} — open and finalize when ready.
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[560px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="pl-5 py-3 pr-4 text-left text-xs font-semibold text-slate-500">Employee</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Last Day</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Separation</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Net Final Pay</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Status</th>
              <th className="pr-4 py-3 text-right text-xs font-semibold text-slate-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {records.map((r) => {
              const name = r.employee
                ? `${r.employee.first_name} ${r.employee.last_name}`
                : `#${r.employee_id}`;
              const isCancelled = r.status === "cancelled";
              return (
                <tr key={r.id} className={`hover:bg-slate-50/80 transition-colors ${isCancelled ? "opacity-40" : ""}`}>
                  <td className="pl-5 pr-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                        {name.charAt(0)}
                      </div>
                      <div>
                        <p className={`text-sm font-medium ${isCancelled ? "line-through text-slate-400" : "text-slate-800"}`}>{name}</p>
                        <p className="text-xs text-slate-400">{r.employee?.employee_no}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-slate-600 whitespace-nowrap">{fmtDate(r.last_working_day)}</td>
                  <td className="px-4 py-3.5 text-xs text-slate-500">{SEP_LABELS[r.separation_type] ?? r.separation_type}</td>
                  <td className="px-4 py-3.5 text-right text-sm font-bold tabular-nums text-emerald-700">{php(r.net_final_pay)}</td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${STATUS_STYLE[r.status] ?? STATUS_STYLE.draft}`}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="pr-4 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Link href={`/final-pay/${r.id}`}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 transition shadow-sm">
                        View
                      </Link>
                      <button
                        onClick={() => { if (window.confirm(`Delete final pay record for ${name}?`)) deleteMutation.mutate(r.id); }}
                        disabled={deleteMutation.isPending}
                        className="rounded-lg border border-red-100 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50 transition">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────

export default function FinalPayPage() {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Final Pay</h1>
          <p className="mt-0.5 text-sm text-slate-500">Compute and record employee separation pay.</p>
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Computation
          </button>
        )}
      </div>

      {showForm
        ? <NewFinalPayForm
            onSaved={(id) => window.location.assign(`/final-pay/${id}`)}
            onBack={() => setShowForm(false)}
          />
        : <RecordsList onNew={() => setShowForm(true)} />
      }
    </div>
  );
}
