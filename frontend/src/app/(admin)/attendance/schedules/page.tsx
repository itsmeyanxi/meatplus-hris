"use client";

import { useQuery } from "@tanstack/react-query";
import { workSchedulesApi, type WorkScheduleDay } from "@/lib/attendance";
import { AppCard, PageHeader, TableShell } from "@/components/ui";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function SchedulesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["work-schedules"],
    queryFn: workSchedulesApi.list,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Work schedules"
        description={
          isLoading
            ? "Loading…"
            : `${data?.length ?? 0} schedule${(data?.length ?? 0) === 1 ? "" : "s"}. Editing UI lands in Phase 2.1; seed data is in place.`
        }
      />

      {data?.length === 0 && !isLoading && (
        <AppCard>
          <p className="py-8 text-center text-sm text-slate-500">No work schedules defined yet.</p>
        </AppCard>
      )}

      {data?.map((s) => (
        <AppCard key={s.id}>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900">{s.name}</h3>
              <p className="font-mono text-xs uppercase tracking-wider text-slate-400">{s.code}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {s.weekly_workdays}-day week
              {s.breaks_paid ? " · paid breaks" : " · unpaid breaks"}
              {s.is_flexible ? " · flexi" : ""}
            </span>
          </div>
          {s.description && <p className="mb-4 text-sm text-slate-500">{s.description}</p>}

          <TableShell>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                  {["Day", "In", "Out", "Break", "Required", "Rest"].map((h) => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.days?.map((d: WorkScheduleDay) => (
                  <tr key={d.day_of_week} className={"border-t border-slate-100 " + (d.is_rest_day ? "bg-slate-50" : "hover:bg-slate-50/70")}>
                    <td className="px-4 py-3 font-medium text-slate-800">{DAY_NAMES[d.day_of_week]}</td>
                    <td className="px-4 py-3 text-slate-600">{d.time_in?.slice(0, 5) ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{d.time_out?.slice(0, 5) ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{d.break_minutes} min</td>
                    <td className="px-4 py-3 text-slate-600">{d.required_hours}h</td>
                    <td className="px-4 py-3 text-slate-600">{d.is_rest_day ? "Yes" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        </AppCard>
      ))}
    </div>
  );
}
