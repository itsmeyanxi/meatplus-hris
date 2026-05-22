import Link from "next/link";

const TILES = [
  {
    href: "/attendance/requests/overtime",
    title: "Overtime",
    desc: "Pre-approve work beyond scheduled hours. Approved OT is counted by the DTR engine.",
  },
  {
    href: "/attendance/requests/undertime",
    title: "Undertime",
    desc: "Leave before scheduled end of shift for personal reasons.",
  },
  {
    href: "/attendance/requests/official-business",
    title: "Official business",
    desc: "Off-site work — client visits, BIR/SSS errands, training. Treated as worked time once approved.",
  },
  {
    href: "/attendance/requests/certificate-of-attendance",
    title: "Certificate of attendance",
    desc: "File when you missed a punch — claim the time you actually arrived / left.",
  },
  {
    href: "/attendance/requests/corrections",
    title: "Attendance corrections",
    desc: "Fix wrong DTR rows after they were posted. Audit-trailed.",
  },
];

export default function RequestsLanding() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Requests &amp; approvals</h2>
        <p className="text-sm text-slate-500">
          Each request type has the same lifecycle: <em>pending → approved / rejected / cancelled</em>. Only pending requests can be acted on.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
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
