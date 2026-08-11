"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCrewToday, addCrewEmployee, assignExistingToCrew, type NewCrewEmployee } from "@/lib/crews";
import { EmployeeSearchSelect } from "@/components/EmployeeSearchSelect";
import { BranchAttendanceReport } from "@/components/attendance/BranchAttendanceReport";
import { PageHeader, AppButton, TableShell } from "@/components/ui";
import { inputCls, labelCls } from "@/lib/form-classes";

const STATUS: Record<string, { label: string; cls: string }> = {
  complete: { label: "In & Out", cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
  no_out: { label: "No time-out", cls: "bg-amber-50 text-amber-700 ring-1 ring-amber-200" },
  no_punch: { label: "No punch", cls: "bg-slate-100 text-slate-500 ring-1 ring-slate-200" },
};

export default function CrewBoardPage() {
  const params = useParams();
  const crewId = Number(params.id);
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["crew-today", crewId],
    queryFn: () => getCrewToday(crewId),
    enabled: Number.isFinite(crewId),
    refetchInterval: 60_000,
  });

  const s = data?.summary;

  return (
    <div className="space-y-4">
      <Link href="/crews" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        All crews
      </Link>

      <PageHeader
        title={data?.agency.name ?? (isLoading ? "Loading…" : "Crew")}
        description={data ? `${data.date} · today's time in / out board` : ""}
        actions={<AppButton onClick={() => setAdding((v) => !v)}>{adding ? "Cancel" : "+ Add worker"}</AppButton>}
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <Stat label="Workers" value={s?.headcount} color="slate" />
        <Stat label="Present" value={s?.present} color="emerald" />
        <Stat label="In & Out" value={s?.complete} color="emerald" />
        <Stat label="No time-out" value={s?.no_out} color="amber" />
        <Stat label="No punch" value={s?.no_punch} color="slate" />
      </div>

      {adding && <AddPanel crewId={crewId} onDone={() => { setAdding(false); qc.invalidateQueries({ queryKey: ["crew-today", crewId] }); }} />}

      {/* Full attendance report — date range + worker filter, View data / Excel / PDF. */}
      <BranchAttendanceReport
        branchId={crewId}
        branchName={data?.agency.name}
        termSingular="crew"
        filePrefix="crew"
        workers={data?.employees ?? []}
      />

      <TableShell>
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-3">Employee #</th>
              <th className="px-3 py-3">Name</th>
              <th className="px-3 py-3">Bio ID</th>
              <th className="px-3 py-3">Time In</th>
              <th className="px-3 py-3">Time Out</th>
              <th className="px-3 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && Array.from({ length: 4 }).map((_, i) => (
              <tr key={i} className="animate-pulse"><td colSpan={6} className="px-3 py-3"><div className="h-4 w-40 rounded bg-slate-200" /></td></tr>
            ))}
            {!isLoading && (data?.employees.length ?? 0) === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                No workers in this crew yet. Use <strong>+ Add worker</strong> to assign them.
              </td></tr>
            )}
            {data?.employees.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50">
                <td className="px-3 py-2 font-mono text-xs text-slate-900">{e.employee_no}</td>
                <td className="px-3 py-2 font-medium text-slate-900">
                  <Link href={`/employees/${e.id}`} className="text-slate-900 hover:text-brand-700 hover:underline">{e.name}</Link>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-500">{e.biometric_id ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums">{e.time_in ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums">{e.time_out ?? "—"}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS[e.status]?.cls ?? ""}`}>
                    {STATUS[e.status]?.label ?? e.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}

const COLORS = {
  slate: "bg-slate-50 border-slate-200 text-slate-900",
  emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
  amber: "bg-amber-50 border-amber-200 text-amber-800",
} as const;

function Stat({ label, value, color }: { label: string; value?: number; color: keyof typeof COLORS }) {
  return (
    <div className={`flex flex-col rounded-xl border p-4 ${COLORS[color]}`}>
      <span className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</span>
      <span className="mt-1 text-2xl font-bold tabular-nums">
        {value === undefined ? <span className="inline-block h-6 w-10 animate-pulse rounded bg-current opacity-20" /> : value}
      </span>
    </div>
  );
}

function AddPanel({ crewId, onDone }: { crewId: number; onDone: () => void }) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-4 inline-flex rounded-lg border border-slate-200 p-0.5 text-sm">
        <button
          type="button"
          onClick={() => setMode("existing")}
          className={`rounded-md px-3 py-1.5 font-medium transition ${mode === "existing" ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
        >
          Add existing worker
        </button>
        <button
          type="button"
          onClick={() => setMode("new")}
          className={`rounded-md px-3 py-1.5 font-medium transition ${mode === "new" ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
        >
          Create new worker
        </button>
      </div>
      {mode === "existing" ? <AssignExistingForm crewId={crewId} onDone={onDone} /> : <NewWorkerFields crewId={crewId} onDone={onDone} />}
    </div>
  );
}

function AssignExistingForm({ crewId, onDone }: { crewId: number; onDone: () => void }) {
  const [picked, setPicked] = useState<{ id: number; label: string }[]>([]);
  const [selId, setSelId] = useState<number | "">("");

  const mut = useMutation({
    mutationFn: () => assignExistingToCrew(crewId, picked.map((p) => p.id)),
    onSuccess: onDone,
  });

  const add = (id: number | "", label?: string) => {
    if (id === "" || picked.some((p) => p.id === id)) return;
    setPicked((p) => [...p, { id: Number(id), label: label ?? String(id) }]);
    setSelId("");
  };

  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-slate-800">Add already-registered PASEI workers to this crew</p>
      <p className="mb-3 text-xs text-slate-500">Search any PASEI worker by name or employee number. Assigning moves them into this crew.</p>
      <EmployeeSearchSelect value={selId} onChange={add} scope="all" placeholder="Search worker to add…" />

      {picked.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {picked.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 py-0.5 pl-2.5 pr-1.5 text-xs font-medium text-slate-700">
              {p.label}
              <button type="button" onClick={() => setPicked((x) => x.filter((y) => y.id !== p.id))}
                className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-slate-200">×</button>
            </span>
          ))}
        </div>
      )}

      {mut.isError && <p className="mt-2 text-xs text-red-600">Could not assign. Try again.</p>}

      <div className="mt-3 flex justify-end">
        <AppButton onClick={() => mut.mutate()} disabled={picked.length === 0 || mut.isPending}>
          {mut.isPending ? "Assigning…" : `Assign ${picked.length || ""} to crew`}
        </AppButton>
      </div>
    </div>
  );
}

function NewWorkerFields({ crewId, onDone }: { crewId: number; onDone: () => void }) {
  const [form, setForm] = useState<NewCrewEmployee>({ employee_no: "", first_name: "", last_name: "" });
  const set = (k: keyof NewCrewEmployee) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const mut = useMutation({
    mutationFn: () => addCrewEmployee(crewId, form),
    onSuccess: onDone,
  });
  const err = (mut.error as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } } | null)?.response?.data;
  const canSubmit = form.employee_no.trim() && form.first_name.trim() && form.last_name.trim();

  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-slate-800">Create a brand-new worker in this crew</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block"><span className={labelCls}>Employee #</span>
          <input className={inputCls} value={form.employee_no} onChange={set("employee_no")} placeholder="e.g. 197" /></label>
        <label className="block"><span className={labelCls}>First name</span>
          <input className={inputCls} value={form.first_name} onChange={set("first_name")} /></label>
        <label className="block"><span className={labelCls}>Last name</span>
          <input className={inputCls} value={form.last_name} onChange={set("last_name")} /></label>
        <label className="block"><span className={labelCls}>Biometric ID</span>
          <input className={inputCls} value={form.biometric_user_id ?? ""} onChange={set("biometric_user_id")} placeholder="defaults to Employee #" /></label>
        <label className="block"><span className={labelCls}>Position</span>
          <input className={inputCls} value={form.position ?? ""} onChange={set("position")} placeholder="optional" /></label>
      </div>
      {err?.message && <p className="mt-2 text-xs text-red-600">{err.message}</p>}
      <div className="mt-3 flex justify-end">
        <AppButton onClick={() => mut.mutate()} disabled={!canSubmit || mut.isPending}>{mut.isPending ? "Adding…" : "Add worker"}</AppButton>
      </div>
    </div>
  );
}
