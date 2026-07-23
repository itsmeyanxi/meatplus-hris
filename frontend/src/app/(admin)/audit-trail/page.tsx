"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader, TableShell } from "@/components/ui";
import { SearchSelect } from "@/components/SearchSelect";

type Change = { field: string; old: string | number | boolean | null; new: string | number | boolean | null };
type AuditEntry = {
  id: number;
  log_name: string | null;
  event: string | null;
  subject_type: string | null;
  subject_id: number | null;
  subject_label: string | null;
  causer: string;
  changes: Change[];
  created_at: string;
};
type AuditResponse = { data: AuditEntry[]; meta: { log_names: string[]; events: string[] } };

const EVENT_STYLE: Record<string, string> = {
  created: "bg-emerald-50 text-emerald-700",
  updated: "bg-amber-50 text-amber-700",
  deleted: "bg-rose-50 text-rose-700",
};

function val(v: Change["old"]): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

export default function AuditTrailPage() {
  const [q, setQ] = useState("");
  const [logName, setLogName] = useState("");
  const [event, setEvent] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["audit-trail", { q, logName, event }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (logName) params.set("log_name", logName);
      if (event) params.set("event", event);
      return (await api.get<AuditResponse>(`/api/v1/audit-trail?${params.toString()}`)).data;
    },
    placeholderData: keepPreviousData,
  });

  const rows = data?.data ?? [];
  const selectCls = "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-slate-900";

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
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search person or description…"
          className={`${selectCls} min-w-[240px] flex-1`}
        />
        <SearchSelect
          value={logName}
          onChange={setLogName}
          className={selectCls}
          options={[
            { value: "", label: "All areas" },
            ...(data?.meta.log_names ?? []).map((l) => ({ value: l, label: l })),
          ]}
        />
        <SearchSelect
          value={event}
          onChange={setEvent}
          className={selectCls}
          options={[
            { value: "", label: "All actions" },
            ...(data?.meta.events ?? []).map((ev) => ({ value: ev, label: ev })),
          ]}
        />
        {(q || logName || event) && (
          <button
            onClick={() => { setQ(""); setLogName(""); setEvent(""); }}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:text-slate-800"
          >
            Clear
          </button>
        )}
      </div>

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
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{new Date(a.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{a.causer}</td>
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
                              <span className="font-medium text-slate-600">{c.field.replace(/_/g, " ")}</span>:{" "}
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
    </div>
  );
}
