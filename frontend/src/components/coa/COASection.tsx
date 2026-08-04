"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { type Me } from "@/lib/auth";
import { EmployeeSearchSelect } from "@/components/EmployeeSearchSelect";
import {
  certificateOfAttendanceApi,
  type CertificateOfAttendanceInput,
  type CertificateOfAttendanceRequest,
} from "@/lib/approvals";

// ── helpers ───────────────────────────────────────────────────────────────

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-PH", {
    month: "short", day: "numeric", year: "numeric",
  });
}

const PUNCH_LABELS: Record<string, string> = {
  in:   "Missing Time In",
  out:  "Missing Time Out",
  both: "Missing Both",
};

const STATUS_STYLE: Record<string, string> = {
  pending:     "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  approved:    "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  rejected:    "bg-red-50 text-red-700 ring-1 ring-red-200",
  cancelled:   "bg-slate-100 text-slate-500",
  resubmitted: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[status] ?? "bg-slate-100 text-slate-600"}`}>
      {status}
    </span>
  );
}

const inputCls = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100";

// ── calendar ──────────────────────────────────────────────────────────────

const DAYS   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function MiniCalendar({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const today = new Date();
  const [view, setView] = useState(() => {
    const d = value ? new Date(value + "T00:00:00") : today;
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const firstDay    = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const cells       = Array.from({ length: firstDay + daysInMonth }, (_, i) =>
    i < firstDay ? null : i - firstDay + 1,
  );
  const isoOf    = (d: number) => `${view.year}-${String(view.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const todayIso = today.toISOString().slice(0, 10);
  const prev = () => setView(({ year, month }) => month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 });
  const next = () => setView(({ year, month }) => month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 });

  return (
    <div className="select-none">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={prev} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <span className="text-sm font-semibold text-slate-800">{MONTHS[view.month]} {view.year}</span>
        <button type="button" onClick={next} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
      <div className="mb-1 grid grid-cols-7 text-center">
        {DAYS.map((d) => <span key={d} className="py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {cells.map((day, i) => {
          if (!day) return <span key={i} />;
          const iso = isoOf(day);
          const isSelected = iso === value;
          const isToday    = iso === todayIso;
          return (
            <button key={i} type="button" onClick={() => onChange(iso)}
              className={["mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition",
                isSelected ? "bg-green-600 text-white shadow-sm"
                : isToday  ? "border-2 border-green-500 text-green-700 hover:bg-green-50"
                           : "text-slate-700 hover:bg-slate-100",
              ].join(" ")}>
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── type selector ─────────────────────────────────────────────────────────

type MissedPunch = CertificateOfAttendanceInput["missed_punch"];

const PUNCH_OPTIONS: { value: MissedPunch; label: string; icon: string }[] = [
  { value: "in",   label: "Missing Time In",  icon: "→" },
  { value: "out",  label: "Missing Time Out", icon: "←" },
  { value: "both", label: "Missing Both",     icon: "⇌" },
];

function TypeSelector({ value, onChange }: { value: MissedPunch; onChange: (v: MissedPunch) => void }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {PUNCH_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button key={opt.value} type="button" onClick={() => onChange(opt.value)}
            className={["flex flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-3 text-center transition",
              active ? "border-green-500 bg-green-50 text-green-800"
                     : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
            ].join(" ")}>
            <span className={`text-lg leading-none ${active ? "text-green-600" : "text-slate-400"}`}>{opt.icon}</span>
            <span className="text-xs font-semibold">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── create form ────────────────────────────────────────────────────────────

function CreateForm({
  employeeId, canManage, meData, onClose,
}: {
  employeeId: number; canManage: boolean; meData: Me | undefined; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<CertificateOfAttendanceInput>({
    work_date: "", missed_punch: "in", claimed_time_in: "", claimed_time_out: "", reason: "",
  });
  const [details, setDetails]            = useState("");
  const [adminEmployeeId, setAdminEmpId] = useState<number>(employeeId);
  const targetEmpId = canManage ? adminEmployeeId : employeeId;

  const create = useMutation({
    mutationFn: () => certificateOfAttendanceApi.create({
      ...form,
      employee_id:      targetEmpId,
      reason:           details || form.reason,
      claimed_time_in:  form.missed_punch !== "out" ? (form.claimed_time_in  || null) : null,
      claimed_time_out: form.missed_punch !== "in"  ? (form.claimed_time_out || null) : null,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["coa-requests"] }); onClose(); },
  });

  const employee = meData?.user?.employee;
  const needIn   = form.missed_punch === "in"  || form.missed_punch === "both";
  const needOut  = form.missed_punch === "out" || form.missed_punch === "both";

  return (
    <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="divide-y divide-slate-100">
      {/* banner */}
      <div className="flex items-center justify-between gap-4 bg-green-50 px-6 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {employee && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-700 px-3 py-1 text-xs font-semibold text-white">
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20"><path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" /></svg>
              {employee.full_name}
            </span>
          )}
          {canManage && (
            <EmployeeSearchSelect
              className="w-64"
              value={adminEmployeeId || ""}
              onChange={(id) => setAdminEmpId(id === "" ? 0 : Number(id))}
              placeholder="Select employee…"
            />
          )}
          <span className="text-xs text-green-700">Certificate of Attendance Application Form</span>
        </div>
        <button type="button" onClick={onClose} className="text-xs font-medium text-green-700 hover:text-green-900">✕ Close</button>
      </div>

      <div className="px-6 py-5 space-y-6">
        {/* Type */}
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Select Type</label>
          <TypeSelector value={form.missed_punch} onChange={(v) => setForm({ ...form, missed_punch: v })} />
        </div>

        {/* Dates + Log Hours */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100">
                <svg className="h-3.5 w-3.5 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">Attendance Dates</p>
                <p className="text-xs text-slate-400">Select the date to add attendance to</p>
              </div>
            </div>
            {form.work_date && (
              <div className="mb-3 flex items-center justify-between rounded-lg bg-green-600 px-3 py-1.5">
                <span className="text-xs font-semibold text-white">{fmt(form.work_date)}</span>
                <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold text-white">1 selected</span>
              </div>
            )}
            <MiniCalendar value={form.work_date} onChange={(d) => setForm({ ...form, work_date: d })} />
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100">
                <svg className="h-3.5 w-3.5 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" /></svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">Log Hours</p>
                <p className="text-xs text-slate-400">Add in clock in/out hours for the selected date</p>
              </div>
            </div>
            {!form.work_date ? (
              <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-10 text-center">
                <svg className="mb-2 h-10 w-10 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" /></svg>
                <p className="text-sm font-medium text-slate-400">Select dates first to log your hours.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-600">{fmt(form.work_date)}</p>
                <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
                  {needIn && (
                    <div className="flex items-center gap-3 px-3 py-3">
                      <span className="w-20 shrink-0 text-xs font-medium text-slate-500">Clock In</span>
                      <input type="time" className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-green-500"
                        value={form.claimed_time_in ?? ""} onChange={(e) => setForm({ ...form, claimed_time_in: e.target.value })} />
                    </div>
                  )}
                  {needOut && (
                    <div className="flex items-center gap-3 px-3 py-3">
                      <span className="w-20 shrink-0 text-xs font-medium text-slate-500">Clock Out</span>
                      <input type="time" className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-green-500"
                        value={form.claimed_time_out ?? ""} onChange={(e) => setForm({ ...form, claimed_time_out: e.target.value })} />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Details */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 space-y-4">
          <div>
            <p className="text-sm font-semibold text-slate-700">Details</p>
            <p className="text-xs text-slate-400 mt-0.5">Let your approvers know the details of your attendance request.</p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              {PUNCH_LABELS[form.missed_punch ?? "both"]} <span className="font-normal text-slate-400">(Required)</span>
            </label>
            <textarea className={inputCls} rows={2}
              placeholder={`Explain the issue with your ${PUNCH_LABELS[form.missed_punch ?? "both"].toLowerCase()}…`}
              value={details} onChange={(e) => setDetails(e.target.value)} required />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Reason <span className="font-normal text-slate-400">(Optional)</span>
            </label>
            <textarea className={inputCls} rows={3} placeholder="Any additional context for your approver…"
              value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>
        </div>

        {/* Attachments */}
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">Attachments</p>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-8 text-center transition hover:border-green-300 hover:bg-green-50/30">
            <svg className="h-9 w-9 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
            <span className="text-sm text-slate-500">Drop your image here or <span className="font-semibold text-green-600">browse</span> (optional)</span>
            <span className="text-xs text-slate-400">Supports jpg, png, pdf, docx · 3MB maximum file size</span>
            <input type="file" accept=".jpg,.jpeg,.png,.pdf,.doc,.docx" className="hidden" />
          </label>
        </div>

        {create.isError && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-xs text-red-700">
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            Failed to submit. Please fill in all required fields and select a date.
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-6 py-4">
        <button type="button" onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700">Cancel</button>
        <button type="submit" disabled={create.isPending || !form.work_date}
          className="rounded-lg bg-green-600 px-8 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-60 transition">
          {create.isPending ? "Submitting…" : "Submit Request"}
        </button>
      </div>
    </form>
  );
}

// ── history list ──────────────────────────────────────────────────────────

type HistoryTab = "pending" | "approved" | "rejected";

const HISTORY_TABS: { key: HistoryTab; label: string }[] = [
  { key: "pending",  label: "Pending/Resubmitted for editing" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected/Cancelled" },
];

function MyHistoryList({ employeeId }: { employeeId: number }) {
  const qc   = useQueryClient();
  const [tab, setTab] = useState<HistoryTab>("pending");
  const qKey = ["coa-requests", "mine", employeeId];

  const { data: paginated, isLoading } = useQuery({
    queryKey: qKey,
    queryFn:  () => certificateOfAttendanceApi.list({ employee_id: employeeId }),
    staleTime: 30_000,
  });
  const all = paginated?.data ?? [];

  const rows = all.filter((r) => {
    if (tab === "pending")  return r.status === "pending" || r.status === "resubmitted";
    if (tab === "approved") return r.status === "approved";
    return r.status === "rejected" || r.status === "cancelled";
  });

  const tabLabel: Record<HistoryTab, string> = {
    pending: "Pending", approved: "Approved", rejected: "Rejected / Cancelled",
  };

  return (
    <>
      <div className="flex border-b border-slate-200">
        {HISTORY_TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={["relative px-5 py-3 text-sm font-medium transition-colors",
              tab === t.key
                ? "text-green-700 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-green-600"
                : "text-slate-500 hover:text-slate-700",
            ].join(" ")}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-5 py-3">
        <p className="text-sm font-semibold text-green-700">My Request — {tabLabel[tab]}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px]">
          <thead>
            <tr className="border-y border-slate-100 bg-slate-50">
              {["Status","Date Filed","Type","Work Date","Remarks","Action"].map((h, i) => (
                <th key={h} className={`px-4 py-2.5 text-xs font-semibold text-slate-600 ${i === 5 ? "text-right pr-5" : "text-left"} ${i === 0 ? "pl-5" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center">
                  <svg className="mx-auto mb-2 h-8 w-8 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  <p className="text-sm text-slate-400">No records in this tab.</p>
                </td>
              </tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                <td className="pl-5 pr-4 py-3"><StatusBadge status={r.status} /></td>
                <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{fmt(r.created_at)}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                    {PUNCH_LABELS[r.missed_punch] ?? r.missed_punch}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{fmt(r.work_date)}</td>
                <td className="px-4 py-3 text-xs text-slate-500 max-w-[160px]">
                  <span className="line-clamp-1">{r.decision_remarks ?? "—"}</span>
                </td>
                <td className="pl-4 pr-5 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <Link href={`/certificates-of-attendance/${r.id}`}
                      className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 transition">
                      View
                    </Link>
                    {(r.status === "pending" || r.status === "resubmitted") && (
                      <CancelBtn id={r.id} qKey={qKey} />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CancelBtn({ id, qKey }: { id: number; qKey: unknown[] }) {
  const qc  = useQueryClient();
  const mut = useMutation({
    mutationFn: () => certificateOfAttendanceApi.cancel(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: qKey }),
  });
  return (
    <button onClick={() => mut.mutate()} disabled={mut.isPending}
      className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition disabled:opacity-50">
      Cancel
    </button>
  );
}

// ── approval queue ────────────────────────────────────────────────────────

function ApprovalRow({ req, qKey }: { req: CertificateOfAttendanceRequest; qKey: unknown[] }) {
  const qc = useQueryClient();
  const [remarks, setRemarks]   = useState("");
  const [deciding, setDeciding] = useState<"approve" | "reject" | null>(null);

  const decide = useMutation({
    mutationFn: (action: "approve" | "reject") =>
      action === "approve"
        ? certificateOfAttendanceApi.approve(req.id, remarks)
        : certificateOfAttendanceApi.reject(req.id, remarks),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qKey }); setDeciding(null); setRemarks(""); },
  });

  return (
    <tr className="hover:bg-slate-50/70 transition-colors">
      <td className="pl-5 pr-4 py-3 whitespace-nowrap">
        <p className="text-sm font-medium text-slate-800">{req.employee?.full_name ?? "—"}</p>
        <p className="text-xs text-slate-400">{req.employee?.employee_no}</p>
      </td>
      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{fmt(req.work_date)}</td>
      <td className="px-4 py-3">
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
          {PUNCH_LABELS[req.missed_punch] ?? req.missed_punch}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-slate-500 max-w-[140px]">
        <span className="line-clamp-1">{req.reason ?? "—"}</span>
      </td>
      <td className="pl-4 pr-5 py-3">
        <div className="flex items-center justify-end gap-2">
          <Link href={`/certificates-of-attendance/${req.id}`}
            className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 transition">
            View
          </Link>
          {deciding ? (
            <div className="flex items-center gap-1.5">
              <input className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-slate-400"
                placeholder="Remarks…" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              <button onClick={() => decide.mutate(deciding)} disabled={decide.isPending}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50 transition ${deciding === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-500 hover:bg-red-600"}`}>
                {decide.isPending ? "…" : "Confirm"}
              </button>
              <button onClick={() => setDeciding(null)} className="text-slate-400 hover:text-slate-600 text-xs">✕</button>
            </div>
          ) : (
            <>
              <button onClick={() => setDeciding("approve")}
                className="rounded-lg bg-green-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-700 transition">
                Approve
              </button>
              <button onClick={() => setDeciding("reject")}
                className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 transition">
                Reject
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function ApprovalQueue({ isHR }: { isHR: boolean }) {
  const qKey = ["coa-requests", "pending", isHR ? "all" : "dept"] as const;
  const { data: paginated, isLoading } = useQuery({
    queryKey: qKey,
    queryFn:  () => certificateOfAttendanceApi.list({ status: "pending" }),
    staleTime: 30_000,
  });
  const pending = paginated?.data ?? [];

  if (isLoading || pending.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-amber-100 bg-amber-50 px-5 py-3">
        <p className="text-sm font-semibold text-amber-800">
          {isHR ? "Pending approval — all employees" : "Pending approval — your department"}
        </p>
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-200 text-xs font-bold text-amber-800">
          {pending.length}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              {["Employee","Work Date","Type","Reason","Action"].map((h, i) => (
                <th key={h} className={`px-4 py-2.5 text-xs font-semibold text-slate-600 ${i === 4 ? "text-right pr-5" : "text-left"} ${i === 0 ? "pl-5" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {pending.map((r) => <ApprovalRow key={r.id} req={r} qKey={[...qKey]} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── main export ───────────────────────────────────────────────────────────

export function COASection({
  employeeId, isHR, isApprover, canManage, meData,
}: {
  employeeId: number | null;
  isHR: boolean;
  isApprover: boolean;
  canManage: boolean;
  meData: Me | undefined;
}) {
  const [creating, setCreating] = useState(false);
  const showQueue = isHR || isApprover;

  return (
    <div className="space-y-4">
      {/* approval queue — amber-accented, only for HR/approvers */}
      {showQueue && <ApprovalQueue isHR={isHR} />}

      {/* main card */}
      {employeeId && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <p className="text-lg font-bold text-green-700">My Certificates of Attendance</p>
            {!creating && (
              <button onClick={() => setCreating(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-green-700 transition">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                Add
              </button>
            )}
          </div>

          {creating ? (
            <CreateForm
              employeeId={employeeId}
              canManage={canManage}
              meData={meData}
              onClose={() => setCreating(false)}
            />
          ) : (
            <MyHistoryList employeeId={employeeId} />
          )}
        </div>
      )}
    </div>
  );
}
