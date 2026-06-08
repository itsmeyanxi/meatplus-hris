import Link from "next/link";
import { PageHeader } from "@/components/ui";

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
    <div className="space-y-6">
      <PageHeader
        title="Requests & approvals"
        description="Each request type follows the same lifecycle: pending → approved / rejected / cancelled. Only pending requests can be acted on."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {TILES.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="group rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur transition hover:border-slate-300 hover:shadow-md"
          >
            <h3 className="text-base font-semibold text-slate-900">{t.title}</h3>
            <p className="mt-1 text-sm text-slate-500">{t.desc}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition group-hover:text-slate-900">
              Open
              <span aria-hidden>&rarr;</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
