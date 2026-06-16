"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  workSchedulesApi,
  type WorkSchedule,
  type WorkScheduleDay,
} from "@/lib/attendance";
import { AppButton, AppCard, PageHeader, TableShell } from "@/components/ui";
import { RoleGate, HR_ROLES } from "@/components/RoleGate";
import { useConfirm } from "@/components/ConfirmDialog";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

import { inputCls, labelCls } from "@/lib/form-classes";

type DayForm = {
  day_of_week: number;
  is_rest_day: boolean;
  time_in: string; // "HH:MM" for the <input type=time>
  time_out: string;
  break_minutes: number;
};

type MetaForm = {
  code: string;
  name: string;
  description: string;
  is_flexible: boolean;
  breaks_paid: boolean;
  is_active: boolean;
};

type EditorState = { mode: "new" | number; meta: MetaForm; days: DayForm[] };

const emptyMeta: MetaForm = {
  code: "",
  name: "",
  description: "",
  is_flexible: false,
  breaks_paid: true,
  is_active: true,
};

const defaultDays = (): DayForm[] =>
  Array.from({ length: 7 }, (_, dow) => {
    const rest = dow === 0 || dow === 6;
    return {
      day_of_week: dow,
      is_rest_day: rest,
      time_in: rest ? "" : "08:00",
      time_out: rest ? "" : "17:00",
      break_minutes: rest ? 0 : 60,
    };
  });

function toDayForms(days?: WorkScheduleDay[]): DayForm[] {
  const base = defaultDays();
  for (const d of days ?? []) {
    const i = base.findIndex((b) => b.day_of_week === d.day_of_week);
    if (i >= 0) {
      base[i] = {
        day_of_week: d.day_of_week,
        is_rest_day: d.is_rest_day,
        time_in: d.time_in?.slice(0, 5) ?? "",
        time_out: d.time_out?.slice(0, 5) ?? "",
        break_minutes: d.break_minutes,
      };
    }
  }
  return base;
}

function reqHours(d: DayForm): number {
  if (d.is_rest_day || !d.time_in || !d.time_out) return 0;
  const [ih, im] = d.time_in.split(":").map(Number);
  const [oh, om] = d.time_out.split(":").map(Number);
  const mins = oh * 60 + om - (ih * 60 + im) - d.break_minutes;
  return mins > 0 ? Math.round((mins / 60) * 100) / 100 : 0;
}

export default function SchedulesPage() {
  return (
    <RoleGate roles={HR_ROLES}>
      <SchedulesPageInner />
    </RoleGate>
  );
}

function SchedulesPageInner() {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const { data, isLoading } = useQuery({
    queryKey: ["work-schedules"],
    queryFn: workSchedulesApi.list,
  });

  const [editor, setEditor] = useState<EditorState | null>(null);

  const closeEditor = () => setEditor(null);

  const save = useMutation({
    mutationFn: () => {
      if (!editor) throw new Error("No editor open");
      const body = {
        ...editor.meta,
        description: editor.meta.description || null,
        weekly_workdays: editor.days.filter((d) => !d.is_rest_day).length,
        days: editor.days.map((d) => ({
          day_of_week: d.day_of_week,
          is_rest_day: d.is_rest_day,
          time_in: d.is_rest_day || !d.time_in ? null : `${d.time_in}:00`,
          time_out: d.is_rest_day || !d.time_out ? null : `${d.time_out}:00`,
          break_minutes: d.is_rest_day ? 0 : d.break_minutes,
          required_hours: reqHours(d),
        })),
      };
      return editor.mode === "new"
        ? workSchedulesApi.create(body)
        : workSchedulesApi.update(editor.mode, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-schedules"] });
      closeEditor();
    },
    meta: { successMessage: "Work schedule saved." },
  });

  const remove = useMutation({
    mutationFn: (id: number) => workSchedulesApi.destroy(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["work-schedules"] }),
    meta: { successMessage: "Work schedule archived." },
  });

  const startNew = () =>
    setEditor({ mode: "new", meta: { ...emptyMeta }, days: defaultDays() });

  const startEdit = (s: WorkSchedule) =>
    setEditor({
      mode: s.id,
      meta: {
        code: s.code,
        name: s.name,
        description: s.description ?? "",
        is_flexible: s.is_flexible,
        breaks_paid: s.breaks_paid,
        is_active: s.is_active,
      },
      days: toDayForms(s.days),
    });

  const setMeta = (patch: Partial<MetaForm>) =>
    setEditor((e) => (e ? { ...e, meta: { ...e.meta, ...patch } } : e));

  const setDay = (dow: number, patch: Partial<DayForm>) =>
    setEditor((e) =>
      e
        ? { ...e, days: e.days.map((d) => (d.day_of_week === dow ? { ...d, ...patch } : d)) }
        : e,
    );

  const canSave =
    editor !== null &&
    editor.meta.code.trim() !== "" &&
    editor.meta.name.trim() !== "" &&
    editor.days.every((d) => d.is_rest_day || (d.time_in && d.time_out));

  return (
    <div className="space-y-6">
      {dialog}
      <PageHeader
        title="Work schedules"
        description={
          isLoading
            ? "Loading…"
            : `${data?.length ?? 0} schedule${(data?.length ?? 0) === 1 ? "" : "s"}. Define shift patterns assigned to employees.`
        }
        actions={
          editor ? (
            <AppButton variant="secondary" onClick={closeEditor}>
              Cancel
            </AppButton>
          ) : (
            <AppButton onClick={startNew}>+ New schedule</AppButton>
          )
        }
      />

      {editor && (
        <AppCard title={editor.mode === "new" ? "New work schedule" : "Edit work schedule"}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (canSave) save.mutate();
            }}
            className="space-y-5"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className={labelCls}>Code *</label>
                <input
                  className={inputCls}
                  placeholder="e.g. STD-MF-8-5"
                  value={editor.meta.code}
                  onChange={(e) => setMeta({ code: e.target.value })}
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Name *</label>
                <input
                  className={inputCls}
                  placeholder="e.g. Standard Mon–Fri 8–5"
                  value={editor.meta.name}
                  onChange={(e) => setMeta({ name: e.target.value })}
                  required
                />
              </div>
              <div className="sm:col-span-3">
                <label className={labelCls}>Description</label>
                <input
                  className={inputCls}
                  placeholder="Optional"
                  value={editor.meta.description}
                  onChange={(e) => setMeta({ description: e.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-5">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={editor.meta.breaks_paid}
                  onChange={(e) => setMeta({ breaks_paid: e.target.checked })}
                />
                Paid breaks
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={editor.meta.is_flexible}
                  onChange={(e) => setMeta({ is_flexible: e.target.checked })}
                />
                Flexible
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={editor.meta.is_active}
                  onChange={(e) => setMeta({ is_active: e.target.checked })}
                />
                Active
              </label>
            </div>

            <TableShell>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                    {["Day", "Rest", "In", "Out", "Break", "Required"].map((h) => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {editor.days.map((d) => (
                    <tr
                      key={d.day_of_week}
                      className={"border-t border-slate-100 " + (d.is_rest_day ? "bg-slate-50" : "")}
                    >
                      <td className="px-4 py-2.5 font-medium text-slate-800">
                        {DAY_NAMES[d.day_of_week]}
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          type="checkbox"
                          checked={d.is_rest_day}
                          onChange={(e) => setDay(d.day_of_week, { is_rest_day: e.target.checked })}
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          type="time"
                          className={`${inputCls} w-32`}
                          value={d.time_in}
                          disabled={d.is_rest_day}
                          onChange={(e) => setDay(d.day_of_week, { time_in: e.target.value })}
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          type="time"
                          className={`${inputCls} w-32`}
                          value={d.time_out}
                          disabled={d.is_rest_day}
                          onChange={(e) => setDay(d.day_of_week, { time_out: e.target.value })}
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          type="number"
                          min={0}
                          max={480}
                          className={`${inputCls} w-24`}
                          value={d.break_minutes}
                          disabled={d.is_rest_day}
                          onChange={(e) =>
                            setDay(d.day_of_week, { break_minutes: Number(e.target.value) })
                          }
                        />
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{reqHours(d)}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableShell>

            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Required hours per day are computed from in/out minus break.
              </p>
              <div className="flex gap-2">
                <AppButton type="button" variant="secondary" onClick={closeEditor}>
                  Cancel
                </AppButton>
                <AppButton type="submit" disabled={!canSave || save.isPending}>
                  {save.isPending ? "Saving…" : editor.mode === "new" ? "Create schedule" : "Save changes"}
                </AppButton>
              </div>
            </div>
            {save.isError && (
              <p className="text-sm text-red-600">
                Could not save. Check the code is unique and all working days have times.
              </p>
            )}
          </form>
        </AppCard>
      )}

      {data?.length === 0 && !isLoading && !editor && (
        <AppCard>
          <p className="py-8 text-center text-sm text-slate-500">No work schedules defined yet.</p>
        </AppCard>
      )}

      {data?.map((s) => (
        <AppCard key={s.id}>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                {s.name}
                {!s.is_active && (
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                    Inactive
                  </span>
                )}
              </h3>
              <p className="font-mono text-xs uppercase tracking-wider text-slate-400">{s.code}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                {s.weekly_workdays}-day week
                {s.breaks_paid ? " · paid breaks" : " · unpaid breaks"}
                {s.is_flexible ? " · flexi" : ""}
              </span>
              <button
                onClick={() => startEdit(s)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Edit
              </button>
              <button
                onClick={async () => {
                  if (
                    await confirm({
                      title: "Archive work schedule",
                      message: `Archive "${s.name}"? It will be hidden from new assignments.`,
                      confirmLabel: "Archive",
                      danger: true,
                    })
                  ) {
                    remove.mutate(s.id);
                  }
                }}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100"
              >
                Delete
              </button>
            </div>
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
