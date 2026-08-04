"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getMe } from "@/lib/auth";
import {
  branchesAdminApi,
  type BranchGeofence,
  type BranchGeofenceInput,
} from "@/lib/attendance";
import { PageHeader, TableShell } from "@/components/ui";
import { inputCls, labelCls } from "@/lib/form-classes";
import { useBranchTerm } from "@/lib/terminology";

export default function BranchGeofencePage() {
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const canManage = me?.user.permissions.includes("company.manage") ?? false;
  const term = useBranchTerm();

  const { data: branches = [], isLoading } = useQuery({
    queryKey: ["branch-geofence"],
    queryFn: branchesAdminApi.list,
    enabled: canManage,
  });

  if (me && !canManage) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        You don&apos;t have permission to manage {term.singular} geofences.
      </div>
    );
  }

  // Organic worksites and agency worksites are the same kind of record (a branch
  // with a GPS pin) but are managed as distinct groups everywhere else in the app,
  // so keep them visually separated here too instead of one jumbled list.
  const organic = branches.filter((b) => !b.is_agency);
  const agencies = branches.filter((b) => b.is_agency);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${term.Singular} Geofence`}
        description={`Set each worksite's GPS pin and the allowed radius. Web check-ins are measured against the employee's ${term.singular} pin and flagged On-site / Outside. A ${term.singular} with no pin is simply not geofenced yet.`}
      />

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <strong>Tip:</strong> stand at the worksite and tap <em>Use my location</em> to capture
        the pin, or paste coordinates from Google Maps (right-click a spot → the first two numbers).
        Radius defaults to <strong>250 m</strong> when left blank.
      </div>

      <GeofenceSection
        title={`${term.Singular} worksites`}
        colLabel={term.Singular}
        rows={organic}
        isLoading={isLoading}
        emptyLabel={`No ${term.plural} found for this company.`}
      />

      {(isLoading || agencies.length > 0) && (
        <GeofenceSection
          title="Agency worksites"
          subtitle="Manpower-agency sites — geofenced the same way as branches."
          colLabel="Agency"
          rows={agencies}
          isLoading={isLoading}
          emptyLabel="No agency worksites for this company."
        />
      )}
    </div>
  );
}

function GeofenceSection({
  title,
  subtitle,
  colLabel,
  rows,
  isLoading,
  emptyLabel,
}: {
  title: string;
  subtitle?: string;
  colLabel: string;
  rows: BranchGeofence[];
  isLoading: boolean;
  emptyLabel: string;
}) {
  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-sm font-semibold text-slate-700">
          {title}
          {!isLoading && <span className="ml-2 text-xs font-normal text-slate-400">{rows.length}</span>}
        </h2>
        {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
      </div>
      <TableShell>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
              {[colLabel, "Latitude", "Longitude", "Radius (m)", "Status", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">Loading…</td></tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">{emptyLabel}</td></tr>
            )}
            {rows.map((b) => <BranchRow key={b.id} branch={b} />)}
          </tbody>
        </table>
      </TableShell>
    </section>
  );
}

function BranchRow({ branch }: { branch: BranchGeofence }) {
  const qc = useQueryClient();
  const [lat, setLat] = useState(branch.latitude?.toString() ?? "");
  const [lng, setLng] = useState(branch.longitude?.toString() ?? "");
  const [radius, setRadius] = useState(branch.geofence_radius_m?.toString() ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const dirty =
    lat !== (branch.latitude?.toString() ?? "") ||
    lng !== (branch.longitude?.toString() ?? "") ||
    radius !== (branch.geofence_radius_m?.toString() ?? "");

  const save = useMutation({
    mutationFn: () => {
      const body: BranchGeofenceInput = {
        latitude: lat.trim() === "" ? null : Number(lat),
        longitude: lng.trim() === "" ? null : Number(lng),
        geofence_radius_m: radius.trim() === "" ? null : Number(radius),
      };
      return branchesAdminApi.update(branch.id, body);
    },
    onSuccess: () => {
      setMsg("Saved");
      qc.invalidateQueries({ queryKey: ["branch-geofence"] });
      setTimeout(() => setMsg(null), 2000);
    },
    onError: (e: unknown) => {
      setMsg(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          "Save failed",
      );
    },
  });

  const useMyLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setMsg("Geolocation not available — paste coordinates instead.");
      return;
    }
    // Browsers only expose GPS on a secure (HTTPS) origin. On plain HTTP the call
    // fails silently, so explain it and point to the manual method.
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setMsg("GPS needs HTTPS. Paste coordinates from Google Maps instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(7));
        setLng(pos.coords.longitude.toFixed(7));
        setLocating(false);
      },
      (err) => {
        const reason =
          err.code === err.PERMISSION_DENIED
            ? "Location blocked. Allow it in the browser, or paste coordinates."
            : err.code === err.TIMEOUT
              ? "Location timed out. Try again, or paste coordinates."
              : "Could not get your location. Paste coordinates from Google Maps.";
        setMsg(reason);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="px-4 py-3">
        <div className="font-medium text-slate-800">{branch.name}</div>
        <div className="text-xs text-slate-400">
          {branch.code ? `${branch.code} · ` : ""}{[branch.city, branch.province].filter(Boolean).join(", ") || "—"}
          {branch.is_head_office && <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] uppercase text-slate-500">HQ</span>}
        </div>
      </td>
      <td className="px-4 py-3">
        <input className={inputCls} inputMode="decimal" placeholder="14.5995" value={lat} onChange={(e) => setLat(e.target.value)} />
      </td>
      <td className="px-4 py-3">
        <input className={inputCls} inputMode="decimal" placeholder="120.9842" value={lng} onChange={(e) => setLng(e.target.value)} />
      </td>
      <td className="px-4 py-3">
        <input className={inputCls} inputMode="numeric" placeholder="250" value={radius} onChange={(e) => setRadius(e.target.value)} />
        <label className={`${labelCls} mt-1 block`}>default 250</label>
      </td>
      <td className="px-4 py-3">
        {branch.has_pin ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Pinned</span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">No pin</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col items-start gap-1.5">
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {locating ? "Locating…" : "📍 Use my location"}
          </button>
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={!dirty || save.isPending}
            className="rounded-md bg-brand-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
          >
            {save.isPending ? "Saving…" : "Save"}
          </button>
          {msg && <span className="text-[11px] text-slate-500">{msg}</span>}
        </div>
      </td>
    </tr>
  );
}
