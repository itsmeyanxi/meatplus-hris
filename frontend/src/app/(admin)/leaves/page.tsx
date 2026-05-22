import Link from "next/link";

const TILES = [
  { href: "/leaves/applications", title: "Leave applications", desc: "File leave requests, see their status, approve/reject as a manager." },
  { href: "/leaves/balances", title: "Leave balances", desc: "Remaining credits per leave type for the current year." },
  { href: "/leaves/types", title: "Leave types", desc: "PH leave types seeded (VL, SL, EL, ML, PL, SPL, BL, MCW, VAWC, SIL)." },
];

export default function LeavesLanding() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Leaves</h2>
        <p className="text-sm text-slate-500">File, approve, and track leave applications and balances.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {TILES.map((t) => (
          <Link key={t.href} href={t.href} className="rounded-xl border border-slate-200 bg-white p-5 hover:border-slate-400">
            <h3 className="text-base font-semibold">{t.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{t.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
