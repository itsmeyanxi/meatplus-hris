"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { getAgencyToday, addAgencyEmployee, type AgencyTodayRow } from "@/lib/agencies";
import { useBranchTerm } from "@/lib/terminology";
import { ImportEmployeesModal } from "@/components/employees/ImportEmployeesModal";
import { BranchAttendanceReport } from "@/components/attendance/BranchAttendanceReport";
import { PageHeader, AppButton, AppInput, TableShell } from "@/components/ui";
import { inputCls, labelCls } from "@/lib/form-classes";

const STATUS: Record<AgencyTodayRow["status"], { label: string; cls: string }> = {
  complete: { label: "In & Out", cls: "bg-emerald-50 text-emerald-700" },
  no_out: { label: "No time-out", cls: "bg-amber-50 text-amber-700" },
  no_punch: { label: "Not in yet", cls: "bg-slate-100 text-slate-500" },
};

export default function AgencyDetailPage() {
  const params = useParams();
  const branchId = Number(params.id);
  const term = useBranchTerm();

  const qc = useQueryClient();
  const [showImport, setShowImport] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["agency-today", branchId],
    queryFn: () => getAgencyToday(branchId),
    enabled: Number.isFinite(branchId),
    refetchInterval: 60_000, // keep the board fresh
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["agency-today", branchId] });
    qc.invalidateQueries({ queryKey: ["agencies"] });
  };

  // Board filter — click a stat card to narrow the "today" table to that group.
  const [boardFilter, setBoardFilter] = useState<"all" | "present" | "complete" | "no_out" | "no_punch">("all");

  const s = data?.summary;
  const rows = data?.employees ?? [];

  // "Present" = anyone who has already punched in today (In & Out or No time-out).
  const matchesFilter = (r: AgencyTodayRow): boolean => {
    if (boardFilter === "all") return true;
    if (boardFilter === "present") return r.status !== "no_punch";
    return r.status === boardFilter;
  };
  const boardRows = rows.filter(matchesFilter);
  // Clicking the active card again clears the filter.
  const toggleFilter = (f: typeof boardFilter) => setBoardFilter((cur) => (cur === f ? "all" : f));
  const FILTER_LABEL: Record<typeof boardFilter, string> = {
    all: "all workers",
    present: "present today",
    complete: "in & out",
    no_out: "no time-out",
    no_punch: "not in yet",
  };

  return (
    <div className="space-y-4">
      <Link href="/agencies" className="text-sm text-slate-500 hover:text-slate-900">← {term.Plural}</Link>
      <PageHeader
        title={data?.agency.name ?? term.Singular}
        description={s ? `${s.headcount} workers · ${s.present} present today${data?.agency.code ? ` · ${data.agency.code}` : ""}` : "Loading…"}
        actions={
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              Add worker
            </button>
            <button type="button" onClick={() => setShowImport(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Bulk upload
            </button>
          </div>
        }
      />

      {/* Today's attendance stats — click a card to filter the board below */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Present today" value={s?.present} tone="emerald" active={boardFilter === "present"} onClick={() => toggleFilter("present")} />
        <Stat label="In & Out" value={s?.complete} tone="sky" active={boardFilter === "complete"} onClick={() => toggleFilter("complete")} />
        <Stat label="No time-out" value={s?.no_out} tone="amber" active={boardFilter === "no_out"} onClick={() => toggleFilter("no_out")} />
        <Stat label="Not in yet" value={s?.no_punch} tone="slate" active={boardFilter === "no_punch"} onClick={() => toggleFilter("no_punch")} />
      </div>

      {/* Attendance report — shared with the Project Crews board */}
      <BranchAttendanceReport
        branchId={branchId}
        branchName={data?.agency.name}
        termSingular={term.singular}
        filePrefix="agency"
        workers={rows}
      />

      {/* Today's board */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            Today&rsquo;s time in / out{data?.date ? ` · ${data.date}` : ""}
            {boardFilter !== "all" && (
              <span className="ml-2 text-sm font-normal text-slate-500">
                — {boardRows.length} {FILTER_LABEL[boardFilter]}
                <button onClick={() => setBoardFilter("all")} className="ml-2 text-xs font-medium text-brand-700 hover:underline">Show all</button>
              </span>
            )}
          </h2>
          <span className="text-xs text-slate-400">auto-refreshes every minute</span>
        </div>
        <TableShell>
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Employee No</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Time In</th>
                <th className="px-4 py-3">Time Out</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Loading…</td></tr>}
              {!isLoading && rows.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">No workers in this {term.singular}.</td></tr>}
              {!isLoading && rows.length > 0 && boardRows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">No workers {FILTER_LABEL[boardFilter]}.</td></tr>
              )}
              {boardRows.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5"><span className="font-mono text-slate-900">{e.employee_no}</span></td>
                  <td className="px-4 py-2.5">
                    <Link href={`/employees/${e.id}`} className="text-slate-900 hover:underline">{e.name}</Link>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-slate-700">{e.time_in ?? "—"}</td>
                  <td className="px-4 py-2.5 tabular-nums text-slate-700">{e.time_out ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[e.status].cls}`}>
                      {STATUS[e.status].label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      </div>

      {showImport && (
        <ImportEmployeesModal
          mode="agency"
          companies={[]}
          branchId={branchId}
          branchName={data?.agency.name}
          onClose={() => setShowImport(false)}
          onDone={refresh}
        />
      )}
      {showAdd && (
        <AddWorkerModal
          branchId={branchId}
          agencyName={data?.agency.name}
          onClose={() => setShowAdd(false)}
          onDone={() => { setShowAdd(false); refresh(); }}
        />
      )}
    </div>
  );
}

function AddWorkerModal({ branchId, agencyName, onClose, onDone }: { branchId: number; agencyName?: string; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ employee_no: "", first_name: "", last_name: "", biometric_user_id: "", position: "", date_hired: "" });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: () => addAgencyEmployee(branchId, {
      employee_no: form.employee_no.trim(),
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      biometric_user_id: form.biometric_user_id.trim() || undefined,
      position: form.position.trim() || undefined,
      date_hired: form.date_hired || undefined,
    }),
    onSuccess: onDone,
    onError: (e: unknown) => {
      const resp = (e as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } }).response?.data;
      setError(resp?.errors ? Object.values(resp.errors).flat().join(" ") : resp?.message ?? "Could not add the worker.");
    },
  });

  const valid = form.employee_no.trim() && form.first_name.trim() && form.last_name.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Add worker</h2>
          <p className="mt-0.5 text-sm text-slate-500">Added to <strong>{agencyName ?? "this agency"}</strong>.</p>
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <div className="space-y-3">
          <label className="block"><span className={labelCls}>Employee No *</span>
            <AppInput value={form.employee_no} onChange={set("employee_no")} placeholder="e.g. 197" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className={labelCls}>First name *</span>
              <AppInput value={form.first_name} onChange={set("first_name")} /></label>
            <label className="block"><span className={labelCls}>Last name *</span>
              <AppInput value={form.last_name} onChange={set("last_name")} /></label>
          </div>
          <label className="block"><span className={labelCls}>Biometric ID</span>
            <AppInput value={form.biometric_user_id} onChange={set("biometric_user_id")} placeholder="Device PIN — defaults to Employee No" /></label>
          <label className="block"><span className={labelCls}>Position</span>
            <AppInput value={form.position} onChange={set("position")} placeholder="Optional — e.g. Production Crew" /></label>
          <label className="block"><span className={labelCls}>Date hired</span>
            <input type="date" className={inputCls} value={form.date_hired} onChange={set("date_hired")} /></label>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
          <AppButton onClick={() => { setError(null); save.mutate(); }} disabled={!valid || save.isPending}>
            {save.isPending ? "Adding…" : "Add worker"}
          </AppButton>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone, active, onClick }: { label: string; value?: number; tone: "emerald" | "sky" | "amber" | "slate"; active?: boolean; onClick?: () => void }) {
  const tones = {
    emerald: { base: "bg-emerald-50 text-emerald-700", ring: "ring-emerald-500" },
    sky: { base: "bg-sky-50 text-sky-700", ring: "ring-sky-500" },
    amber: { base: "bg-amber-50 text-amber-700", ring: "ring-amber-500" },
    slate: { base: "bg-slate-100 text-slate-600", ring: "ring-slate-400" },
  };
  const t = tones[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-2xl px-4 py-3 text-left transition ${t.base} hover:brightness-95 ${active ? `ring-2 ${t.ring} ring-offset-1` : ""}`}
    >
      <div className="text-2xl font-bold tabular-nums">{value ?? "—"}</div>
      <div className="text-xs font-medium">{label}{active && " ·  filtering"}</div>
    </button>
  );
}
