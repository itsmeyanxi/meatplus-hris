import type { GeoVerdict } from "@/lib/attendance";

/**
 * Renders a punch's captured location: a Google-Maps pin link plus, when the
 * employee's branch has a geofence pin, an inside/outside badge. Shows a muted
 * "no location" note when coordinates are missing (older/denied punches).
 */
export function PunchLocation({
  lat,
  lng,
  geo,
  className = "",
}: {
  lat: number | null;
  lng: number | null;
  geo: GeoVerdict | null;
  className?: string;
}) {
  if (lat == null || lng == null) {
    return <span className={`text-xs text-slate-400 ${className}`}>No location</span>;
  }

  const maps = `https://www.google.com/maps?q=${lat},${lng}`;

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <a
        href={maps}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-0.5 text-xs font-medium text-slate-600 hover:text-teal-700 hover:underline"
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
