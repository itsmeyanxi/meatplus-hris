import Link from "next/link";

const TILES = [
  {
    href: "/attendance/schedules",
    title: "Work schedules",
    desc: "Templates that define daily shifts, rest days, and required hours per day of week.",
  },
  {
    href: "/attendance/holidays",
    title: "Holidays",
    desc: "Regular and special holidays. Used by the DTR engine to flag holiday days.",
  },
  {
    href: "/attendance/time-logs",
    title: "Time logs",
    desc: "Raw in/out punches (biometric, web, mobile, or manual). Append-only.",
  },
  {
    href: "/attendance/dtr",
    title: "Daily time records (DTR)",
    desc: "Computed daily summary: hours worked, late, undertime, OT, rest day, holiday.",
  },
  {
    href: "/attendance/requests",
    title: "Requests & approvals",
    desc: "File and approve overtime, official business, and attendance corrections.",
  },
];

export default function AttendanceLandingPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Attendance</h2>
        <p className="text-sm text-slate-500">
          Manage work schedules, holidays, time logs, and computed daily time records.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {TILES.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="rounded-xl border border-slate-200 bg-white p-5 hover:border-slate-400"
          >
            <h3 className="text-base font-semibold">{t.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{t.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
