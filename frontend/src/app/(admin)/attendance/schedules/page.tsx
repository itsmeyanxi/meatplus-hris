"use client";

import { useQuery } from "@tanstack/react-query";
import { workSchedulesApi, type WorkScheduleDay } from "@/lib/attendance";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function SchedulesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["work-schedules"],
    queryFn: workSchedulesApi.list,
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Work schedules</h2>
        <p className="text-sm text-slate-500">
          {isLoading
            ? "Loading…"
            : `${data?.length ?? 0} schedule(s). Editing UI lands in Phase 2.1; seed data is in place.`}
        </p>
      </div>

      {data?.map((s) => (
        <section key={s.id} className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-baseline justify-between">
            <div>
              <h3 className="text-base font-semibold">{s.name}</h3>
              <p className="text-xs font-mono uppercase tracking-wider text-slate-500">
                {s.code}
              </p>
            </div>
            <span className="text-xs text-slate-500">
              {s.weekly_workdays}-day week
              {s.breaks_paid ? " · paid breaks" : " · unpaid breaks"}
              {s.is_flexible ? " · flexi" : ""}
            </span>
          </div>
          {s.description && <p className="mt-1 text-sm text-slate-600">{s.description}</p>}

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2">Day</th>
                  <th className="px-3 py-2">In</th>
                  <th className="px-3 py-2">Out</th>
                  <th className="px-3 py-2">Break</th>
                  <th className="px-3 py-2">Required</th>
                  <th className="px-3 py-2">Rest</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {s.days?.map((d: WorkScheduleDay) => (
                  <tr key={d.day_of_week} className={d.is_rest_day ? "bg-slate-50" : ""}>
                    <td className="px-3 py-2 font-medium">{DAY_NAMES[d.day_of_week]}</td>
                    <td className="px-3 py-2">{d.time_in?.slice(0, 5) ?? "—"}</td>
                    <td className="px-3 py-2">{d.time_out?.slice(0, 5) ?? "—"}</td>
                    <td className="px-3 py-2">{d.break_minutes} min</td>
                    <td className="px-3 py-2">{d.required_hours}h</td>
                    <td className="px-3 py-2">{d.is_rest_day ? "Yes" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
