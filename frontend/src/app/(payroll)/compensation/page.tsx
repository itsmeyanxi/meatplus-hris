"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, TableShell } from "@/components/ui";
import { SearchSelect } from "@/components/SearchSelect";
import { TableSkeleton, EmptyState } from "@/components/feedback";
import { compensationApi, type CompRow } from "@/lib/payroll";

type Edit = { payType: "monthly" | "daily"; rate: string; allowance: string; effectiveFrom: string };

const TODAY = new Date().toISOString().slice(0, 10);

type ConfiFilter = "all" | "confi" | "non";

export default function CompensationPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["compensations"], queryFn: compensationApi.list });
  const rows = data?.rows;
  const canSeeConfidential = data?.canSeeConfidential ?? false;
  const [edits, setEdits] = useState<Record<number, Edit>>({});
  const [search, setSearch] = useState("");
  const [confiFilter, setConfiFilter] = useState<ConfiFilter>("all");

  // Client-side search (name / employee no) + confidential filter. Confidential
  // rows are already withheld by the server for viewers who can't see them, so
  // this filter only ever narrows what the user is already allowed to see.
  const q = search.trim().toLowerCase();
  const visibleRows = (rows ?? []).filter((r) => {
    if (confiFilter === "confi" && !r.is_confidential) return false;
    if (confiFilter === "non" && r.is_confidential) return false;
    if (!q) return true;
    return r.name.toLowerCase().includes(q) || r.employee_no.toLowerCase().includes(q);
  });

  // The row's edit state, falling back to its saved values. A new rate defaults
  // to taking effect today; HR sets the real effective date for a future raise.
  const base = (r: CompRow): Edit => ({
    payType: r.pay_type === "daily" ? "daily" : "monthly",
    rate: r.pay_type === "daily"
      ? (r.daily_rate != null ? String(r.daily_rate) : "")
      : (r.basic_monthly != null ? String(r.basic_monthly) : ""),
    allowance: r.allowance_monthly != null ? String(r.allowance_monthly) : "",
    effectiveFrom: TODAY,
  });
  const cur = (r: CompRow): Edit => edits[r.employee_id] ?? base(r);
  const patch = (r: CompRow, p: Partial<Edit>) =>
    setEdits((s) => ({ ...s, [r.employee_id]: { ...(s[r.employee_id] ?? base(r)), ...p } }));

  const save = useMutation({
    mutationFn: (r: CompRow) => {
      const e = cur(r);
      return compensationApi.save({
        employee_id: r.employee_id,
        pay_type: e.payType,
        ...(e.payType === "daily"
          ? { daily_rate: Number(e.rate || 0) }
          : { basic_monthly: Number(e.rate || 0) }),
        allowance_monthly: Number(e.allowance || 0),
        effective_from: e.effectiveFrom || TODAY,
      });
    },
    onSuccess: () => {
      toast.success("Compensation saved.");
      qc.invalidateQueries({ queryKey: ["compensations"] });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Compensation" description="Set each employee's pay type and rate. Monthly = fixed salary; Daily = paid per day worked. The Effective date decides which payroll cutoff a new rate starts in — a raise effective mid-cutoff is paid at the new rate for that cutoff." />

      {!isLoading && rows && rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or employee no.…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
            />
          </div>
          {canSeeConfidential && (
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 text-sm">
              {([
                { key: "all", label: "All" },
                { key: "non", label: "Non-confidential" },
                { key: "confi", label: "Confidential" },
              ] as { key: ConfiFilter; label: string }[]).map((opt, i) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setConfiFilter(opt.key)}
                  className={`px-3 py-2 font-medium transition ${i > 0 ? "border-l border-slate-300" : ""} ${
                    confiFilter === opt.key ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
          <span className="text-xs text-slate-400">{visibleRows.length} shown</span>
        </div>
      )}

      {isLoading ? (
        <TableShell><TableSkeleton rows={6} cols={4} /></TableShell>
      ) : !rows || rows.length === 0 ? (
        <EmptyState title="No employees" message="Add employees first." />
      ) : visibleRows.length === 0 ? (
        <EmptyState title="No matches" message="No employees match your search or filter." />
      ) : (
        <TableShell>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Pay type</th>
                <th className="px-4 py-3">Rate</th>
                <th className="px-4 py-3">Allowance / month</th>
                <th className="px-4 py-3">Effective date <span className="text-rose-400">*</span></th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleRows.map((r) => {
                const e = cur(r);
                return (
                  <tr key={r.employee_id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800">{r.name}</span>
                        {r.is_confidential && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                            Confidential
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-xs text-slate-400">{r.employee_no}</div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{r.department ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <SearchSelect
                        className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
                        value={e.payType}
                        onChange={(v) => patch(r, { payType: v as Edit["payType"] })}
                        options={[
                          { value: "monthly", label: "Monthly" },
                          { value: "daily", label: "Daily" },
                        ]}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number" min={0} step="0.01"
                          className="w-32 rounded-lg border border-slate-200 px-2 py-1 text-sm tabular-nums"
                          value={e.rate}
                          onChange={(ev) => patch(r, { rate: ev.target.value })}
                          placeholder="0.00"
                        />
                        <span className="text-xs text-slate-400">{e.payType === "daily" ? "/ day" : "/ month"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        type="number" min={0} step="0.01"
                        className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-sm tabular-nums"
                        value={e.allowance}
                        onChange={(ev) => patch(r, { allowance: ev.target.value })}
                        placeholder="0.00"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        type="date"
                        className={`rounded-lg border px-2 py-1 text-sm ${e.effectiveFrom ? "border-slate-200" : "border-rose-300 bg-rose-50"}`}
                        value={e.effectiveFrom}
                        onChange={(ev) => patch(r, { effectiveFrom: ev.target.value })}
                        title="When this rate starts. Payroll pays this rate from this date onward."
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => save.mutate(r)}
                        disabled={save.isPending || !e.effectiveFrom}
                        title={!e.effectiveFrom ? "Set an effective date first" : "Save this rate"}
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
      )}
    </div>
  );
}
