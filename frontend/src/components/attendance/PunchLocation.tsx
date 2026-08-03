import type { GeoVerdict } from "@/lib/attendance";

/**
 * Renders a punch's captured location: a Google-Maps pin link plus, when the
 * employee's branch has a geofence pin, an inside/outside badge. When the punch
 * itself has no GPS (e.g. biometric), it falls back to the fixed site/company
 * location. Shows a muted "no location" note only when neither is available.
 */
export function PunchLocation({
  lat,
  lng,
  geo,
  siteLabel = null,
  siteLat = null,
  siteLng = null,
  className = "",
}: {
  lat: number | null;
  lng: number | null;
  geo: GeoVerdict | null;
  siteLabel?: string | null;
  siteLat?: number | null;
  siteLng?: number | null;
  className?: string;
}) {
  // No GPS on the punch itself — show the fixed site/company location instead.
  if (lat == null || lng == null) {
    if (siteLabel) {
      const inner = (
        <span className="inline-flex items-center gap-0.5">
          🏢 {siteLabel}
        </span>
      );
      return siteLat != null && siteLng != null ? (
        <a
          href={`https://www.google.com/maps?q=${siteLat},${siteLng}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center text-xs font-medium text-slate-600 hover:text-brand-700 hover:underline ${className}`}
          title={`${siteLabel} — open site location in Google Maps`}
        >
          {inner}
        </a>
      ) : (
        <span className={`text-xs text-slate-500 ${className}`} title="Site / company location">
          {inner}
        </span>
      );
    }
    return <span className={`text-xs text-slate-400 ${className}`}>No location</span>;
  }

  const maps = `https://www.google.com/maps?q=${lat},${lng}`;

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <a
        href={maps}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-0.5 text-xs font-medium text-slate-600 hover:text-brand-700 hover:underline"
        title={`${lat.toFixed(5)}, ${lng.toFixed(5)} — open in Google Maps`}
      >
        📍 Map
      </a>
      {geo && (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
            geo.outside
              ? "bg-rose-100 text-rose-700"
              : "bg-emerald-100 text-emerald-700"
          }`}
          title={`${geo.distance_m} m from ${geo.branch_name} (allowed ${geo.radius_m} m)`}
        >
          {geo.outside ? `Outside · ${geo.distance_m}m` : `On-site · ${geo.distance_m}m`}
        </span>
      )}
    </span>
  );
}
