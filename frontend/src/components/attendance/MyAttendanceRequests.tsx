"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StatusPill } from "@/components/approvals/StatusPill";
import { AppButton } from "@/components/ui";
import {
  certificateOfAttendanceApi,
  correctionsApi,
  officialBusinessApi,
  overtimeApi,
  undertimeApi,
  type ListFilters,
  type RequestStatus,
} from "@/lib/approvals";

const inputCls =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-900/50";
const labelCls = "mb-1.5 block text-sm font-medium text-slate-700";

const TYPES = [
  { key: "overtime", label: "Overtime" },
  { key: "undertime", label: "Undertime" },
  { key: "official_business", label: "Official Business" },
  { key: "certificate", label: "Certificate of Attendance" },
  { key: "correction", label: "Correction" },
] as const;
type ReqType = (typeof TYPES)[number]["key"];

// Common shape across the five request types, so the type-keyed map is callable.
type AnyReq = { id: number; status: RequestStatus; decision_remarks: string | null } & Record<string, unknown>;
type ReqApi = {
  list: (params?: ListFilters) => Promise<AnyReq[]>;
  cancel: (id: number) => Promise<AnyReq>;
};
const API = {
  overtime: overtimeApi,
  undertime: undertimeApi,
  official_business: officialBusinessApi,
  certificate: certificateOfAttendanceApi,
  correction: correctionsApi,
} as unknown as Record<ReqType, ReqApi>;

// A single loosely-typed form bag; the typed payload is assembled at submit.
type FormBag = Record<string, string>;
const EMPTY: FormBag = {};

export function MyAttendanceRequests() {
  const qc = useQueryClient();
  const [type, setType] = useState<ReqType>("overtime");
  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState<FormBag>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const listKey = ["my-attendance-requests", type];
  const { data: items = [] } = useQuery({
    queryKey: listKey,
    queryFn: () => API[type].list(),
  });

  const create = useMutation({
    mutationFn: () => submitRequest(type, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKey });
      setForm(EMPTY);
      setIsAdding(false);
      setError(null);
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { errors?: Record<string, string[]>; message?: string } } };
      const msgs = err?.response?.data?.errors;
      setError(msgs ? Object.values(msgs).flat().join(" ") : err?.response?.data?.message ?? "Failed to file request");
    },
  });

  const cancel = useMutation({
    mutationFn: (id: number) => API[type].cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: listKey }),
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-5">
      {/* Type selector */}
      <div className="flex flex-wrap gap-2">
        {TYPES.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setType(t.key);
              setIsAdding(false);
              setForm(EMPTY);
            }}
            className={
              type === t.key
                ? "rounded-full bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm"
                : "rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{items.length} request(s) — your own only</p>
        <AppButton variant={isAdding ? "secondary" : "primary"} onClick={() => setIsAdding((v) => !v)}>
          {isAdding ? "Cancel" : `+ File ${TYPES.find((t) => t.key === type)?.label}`}
        </AppButton>
      </div>

      {isAdding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2"
        >
          <RequestFields type={type} form={form} set={set} />
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{error}</p>}
          <div className="flex justify-end sm:col-span-2">
            <AppButton type="submit" disabled={create.isPending}>
              {create.isPending ? "Filing…" : "File request"}
            </AppButton>
          </div>
        </form>
      )}

      {/* List */}
      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-8 text-center text-sm text-slate-500">
            No {TYPES.find((t) => t.key === type)?.label.toLowerCase()} requests yet.
          </p>
        ) : (
          items.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{summarize(type, r as unknown as Record<string, unknown>)}</p>
                {r.decision_remarks && (
                  <p className="mt-0.5 text-xs text-slate-500">Remarks: {r.decision_remarks}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <StatusPill status={r.status} />
                {r.status === "pending" && (
                  <button
                    type="button"
                    onClick={() => cancel.mutate(r.id)}
                    disabled={cancel.isPending}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function RequestFields({ type, form, set }: { type: ReqType; form: FormBag; set: (k: string, v: string) => void }) {
  // Invoked as plain functions (not <Components/>) so inputs keep focus across keystrokes.
  const field = (label: string, k: string, t = "text", required = true, full = false) => (
    <div key={k} className={full ? "sm:col-span-2" : ""}>
      <label className={labelCls}>{label}{required && " *"}</label>
      <input type={t} className={inputCls} value={form[k] ?? ""} onChange={(e) => set(k, e.target.value)} required={required} />
    </div>
  );
  const reason = (k = "reason", label = "Reason") => (
    <div key={k} className="sm:col-span-2">
      <label className={labelCls}>{label} *</label>
      <textarea className={`${inputCls} resize-y`} rows={2} value={form[k] ?? ""} onChange={(e) => set(k, e.target.value)} required />
    </div>
  );

  switch (type) {
    case "overtime":
    case "undertime":
      return (
        <>
          {field("Date", "date", "date")}
          {field("Requested hours", "requested_hours", "number")}
          {field("Start time", "start_time", "time")}
          {field("End time", "end_time", "time")}
          {reason()}
        </>
      );
    case "official_business":
      return (
        <>
          {field("Date", "date", "date")}
          {field("Location", "location")}
          {field("Start time", "start_time", "time", false)}
          {field("End time", "end_time", "time", false)}
          {reason("purpose", "Purpose")}
        </>
      );
    case "certificate":
      return (
        <>
          {field("Work date", "work_date", "date")}
          <div>
            <label className={labelCls}>Missed punch *</label>
            <select className={inputCls} value={form.missed_punch ?? ""} onChange={(e) => set("missed_punch", e.target.value)} required>
              <option value="">Select…</option>
              <option value="in">Time in</option>
              <option value="out">Time out</option>
              <option value="both">Both</option>
            </select>
          </div>
          {field("Claimed time in", "claimed_time_in", "time", false)}
          {field("Claimed time out", "claimed_time_out", "time", false)}
          {reason()}
        </>
      );
    case "correction":
      return (
        <>
          {field("Work date", "work_date", "date")}
          {field("Field to correct", "field_to_correct")}
          {field("Correct value", "new_value", "text", true, true)}
          {reason()}
        </>
      );
  }
}

function submitRequest(type: ReqType, f: FormBag): Promise<unknown> {
  const t = (v?: string) => (v ? v : null);
  switch (type) {
    case "overtime":
      return overtimeApi.create({ date: f.date, start_time: f.start_time, end_time: f.end_time, requested_hours: Number(f.requested_hours), reason: f.reason });
    case "undertime":
      return undertimeApi.create({ date: f.date, start_time: f.start_time, end_time: f.end_time, requested_hours: Number(f.requested_hours), reason: f.reason });
    case "official_business":
      return officialBusinessApi.create({ date: f.date, start_time: t(f.start_time), end_time: t(f.end_time), location: f.location, purpose: f.purpose });
    case "certificate":
      return certificateOfAttendanceApi.create({ work_date: f.work_date, missed_punch: f.missed_punch as "in" | "out" | "both", claimed_time_in: t(f.claimed_time_in), claimed_time_out: t(f.claimed_time_out), reason: f.reason });
    case "correction":
      return correctionsApi.create({ work_date: f.work_date, field_to_correct: f.field_to_correct, new_value: f.new_value, reason: f.reason });
  }
}

function summarize(type: ReqType, r: Record<string, unknown>): string {
  const s = (k: string) => (r[k] == null ? "" : String(r[k]));
  switch (type) {
    case "overtime":
    case "undertime":
      return `${s("date")} · ${s("start_time")}–${s("end_time")} · ${s("requested_hours")}h`;
    case "official_business":
      return `${s("date")} · ${s("location")}`;
    case "certificate":
      return `${s("work_date")} · missed ${s("missed_punch")}`;
    case "correction":
      return `${s("work_date")} · ${s("field_to_correct")} → ${s("new_value")}`;
  }
}
