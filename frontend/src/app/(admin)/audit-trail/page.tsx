"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { PageHeader, TableShell } from "@/components/ui";
import { SearchSelect } from "@/components/SearchSelect";
import { inputCls } from "@/lib/form-classes";

type Change = {
  field: string;
  label: string;
  old: string | number | boolean | null;
  new: string | number | boolean | null;
};
type AuditEntry = {
  id: number;
  log_name: string | null;
  event: string | null;
  subject_type: string | null;
  subject_id: number | null;
  subject_label: string | null;
  causer: string;
  is_system: boolean;
  changes: Change[];
  created_at: string;
};
type AuditMeta = {
  page: number;
  per_page: number;
  total: number;
  last_page: number;
  log_names: string[];
  events: string[];
  system_rows: number;
  total_rows: number;
};
type AuditResponse = { data: AuditEntry[]; meta: AuditMeta };

const EVENT_STYLE: Record<string, string> = {
  created: "bg-emerald-50 text-emerald-700",
  updated: "bg-amber-50 text-amber-700",
  deleted: "bg-rose-50 text-rose-700",
};

/** Who performed the change — most of the log is unattributed import/seed activity. */
const ACTOR_OPTIONS = [
  { value: "people", label: "People only" },
  { value: "", label: "Everyone" },
  { value: "system", label: "System / imports" },
];

function val(v: Change["old"]): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

export default function AuditTrailPage() {
  const [q, setQ] = useState("");
  const [logName, setLogName] = useState("");
  const [event, setEvent] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // Default to real human activity: the raw log is ~59% import noise.
  const [actor, setActor] = useState("people");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const params = () => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (logName) p.set("log_name", logName);
    if (event) p.set("event", event);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (actor) p.set("actor", actor);
    return p;
  };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["audit-trail", { q, logName, event, from, to, actor, page }],
    queryFn: async () => {
      const p = params();
      p.set("page", String(page));
      p.set("per_page", "50");
      return (await api.get<AuditResponse>(`/api/v1/audit-trail?${p.toString()}`)).data;
    },
    placeholderData: keepPreviousData,
  });

  const rows = data?.data ?? [];
  const meta = data?.meta;
  const hasFilter = Boolean(q || logName || event || from || to || actor !== "people");

  // Any filter change invalidates the current page number.
  const reset = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setPage(1); };

  const download = async () => {
    setExporting(true);
    try {
      const { data: blob } = await api.get<Blob>(
        `/api/v1/audit-trail/export?${params().toString()}`,
        { responseType: "blob" },
      );
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `audit_trail_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(href);
    } catch {
      toast.error("Couldn't export the audit trail.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Trail"
        description="Every recorded change — who did what, when, and the exact old → new values."
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => reset(setQ)(e.target.value)}
          placeholder="Search person, record or value…"
          className={`${inputCls} min-w-[220px] flex-1`}
        />
        <SearchSelect
          value={actor}
          onChange={reset(setActor)}
          className={inputCls}
          options={ACTOR_OPTIONS}
        />
        <SearchSelect
          value={logName}
          onChange={reset(setLogName)}
          className={inputCls}
          options={[
            { value: "", label: "All areas" },
            ...(meta?.log_names ?? []).map((l) => ({ value: l, label: l })),
          ]}
        />
        <SearchSelect
          value={event}
          onChange={reset(setEvent)}
          className={inputCls}
          options={[
            { value: "", label: "All actions" },
            ...(meta?.events ?? []).map((ev) => ({ value: ev, label: ev })),
          ]}
        />
        <div className="flex items-center gap-1.5">
          <input type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} className={inputCls} title="From date" />
          <span className="text-xs text-slate-400">→</span>
          <input type="date" value={to} onChange={(e) => reset(setTo)(e.target.value)} className={inputCls} title="To date" />
        </div>
        {hasFilter && (
          <button
            onClick={() => { setQ(""); setLogName(""); setEvent(""); setFrom(""); setTo(""); setActor("people"); setPage(1); }}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:text-slate-800"
          >
            Clear
          </button>
        )}
        <button
          onClick={download}
          disabled={exporting || rows.length === 0}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          title="Download the filtered trail as CSV — one row per changed field"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
          </svg>
          {exporting ? "Preparing…" : "Export CSV"}
        </button>
      </div>

      {/* Result count + the share of the log that is import noise */}
      {meta && (
        <p className="text-xs text-slate-500">
          {meta.total.toLocaleString()} entr{meta.total === 1 ? "y" : "ies"}
          {actor === "people" && meta.system_rows > 0 && (
            <> · {meta.system_rows.toLocaleString()} system/import {meta.system_rows === 1 ? "entry" : "entries"} hidden</>
          )}
          {isFetching && <span className="ml-2 text-slate-400">refreshing…</span>}
        </p>
      )}

      <TableShell>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-slate-50">
              <tr>
                {["When", "Who", "Action", "Area", "Record", "Changes"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {isLoading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-400">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-400">No matching activity.</td></tr>
              ) : (
                rows.map((a) => (
                  <tr key={a.id} className="align-top hover:bg-slate-50/60">
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">
                      {new Date(a.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">
                      {a.causer}
                      {a.is_system && <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">import</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${EVENT_STYLE[a.event ?? ""] ?? "bg-slate-100 text-slate-600"}`}>{a.event ?? "—"}</span>
                    </td>
                    <td className="px-4 py-2.5 capitalize text-slate-600">{a.log_name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-600">
                      <div className="font-medium text-slate-800">{a.subject_label ?? "—"}</div>
                      <div className="text-xs text-slate-400">{a.subject_type ? `${a.subject_type} #${a.subject_id}` : ""}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      {a.changes.length === 0 ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {a.changes.map((c) => (
                            <li key={c.field} className="text-xs">
                              <span className="font-medium text-slate-600">{c.label}</span>:{" "}
                              <span className="text-rose-600 line-through">{val(c.old)}</span>{" "}
                              <span className="text-slate-400">→</span>{" "}
                              <span className="text-emerald-700">{val(c.new)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </TableShell>

      {/* Pagination — the log outgrew the old hard 500-row cap long ago. */}
      {meta && meta.last_page > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">
            Page {meta.page} of {meta.last_page}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={meta.page <= 1}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
            >
              ← Newer
            </button>
            <button
              onClick={() => setPage((p) => Math.min(meta.last_page, p + 1))}
              disabled={meta.page >= meta.last_page}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
            >
              Older →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
