"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getMe } from "@/lib/auth";
import {
  departmentsApi,
  positionsApi,
  type Department,
  type Position,
} from "@/lib/master-data";
import { PageHeader } from "@/components/ui";

// ── Permission gate ───────────────────────────────────────────────────────

const MANAGE_PERMS = ["employee.update", "company.manage", "user.manage"];

function canManage(perms: string[]): boolean {
  return MANAGE_PERMS.some((p) => perms.includes(p));
}

// ── Shared helpers ────────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100";

function ConfirmDeleteButton({ onConfirm, disabled }: { onConfirm: () => void; disabled?: boolean }) {
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={() => { onConfirm(); setConfirming(false); }}
          disabled={disabled}
          className="rounded bg-red-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          Yes, delete
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    );
  }
  return (
    <button
      onClick={() => setConfirming(true)}
      className="rounded border border-red-200 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50"
    >
      Delete
    </button>
  );
}

// ── Departments section ───────────────────────────────────────────────────

function DepartmentsSection({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();

  const { data: departments = [], isLoading } = useQuery({
    queryKey: ["departments"],
    queryFn: departmentsApi.list,
  });

  const [addName, setAddName] = useState("");
  const [addCode, setAddCode] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["departments"] });

  const create = useMutation({
    mutationFn: () => departmentsApi.create({ name: addName.trim(), code: addCode.trim() || null }),
    onSuccess: () => { invalidate(); setAddName(""); setAddCode(""); setShowAdd(false); setError(null); },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      setError(e.response?.data?.message ?? "Failed to create department."),
  });

  const update = useMutation({
    mutationFn: (id: number) =>
      departmentsApi.update(id, { name: editName.trim(), code: editCode.trim() || null }),
    onSuccess: () => { invalidate(); setEditingId(null); setError(null); },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      setError(e.response?.data?.message ?? "Failed to update department."),
  });

  const destroy = useMutation({
    mutationFn: departmentsApi.destroy,
    onSuccess: invalidate,
    onError: (e: { response?: { data?: { message?: string } } }) =>
      setError(e.response?.data?.message ?? "Failed to delete department."),
  });

  const startEdit = (d: Department) => {
    setEditingId(d.id);
    setEditName(d.name);
    setEditCode(d.code ?? "");
    setError(null);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="font-semibold text-slate-800">Departments</h2>
          <p className="text-xs text-slate-500 mt-0.5">{departments.length} department{departments.length !== 1 ? "s" : ""}</p>
        </div>
        {canEdit && (
          <button
            onClick={() => { setShowAdd((v) => !v); setError(null); }}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            {showAdd ? "Cancel" : "+ Add"}
          </button>
        )}
      </div>

      {error && (
        <div className="mx-5 mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      )}

      {showAdd && canEdit && (
        <form
          onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
          className="border-b border-slate-100 px-5 py-4"
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[180px]">
              <label className="mb-1 block text-xs font-medium text-slate-600">Name *</label>
              <input
                className={inputCls}
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="e.g. Human Resources"
                required
              />
            </div>
            <div className="w-32">
              <label className="mb-1 block text-xs font-medium text-slate-600">Code</label>
              <input
                className={inputCls}
                value={addCode}
                onChange={(e) => setAddCode(e.target.value)}
                placeholder="e.g. HR"
                maxLength={30}
              />
            </div>
            <button
              type="submit"
              disabled={create.isPending || !addName.trim()}
              className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
            >
              {create.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      )}

      <div className="divide-y divide-slate-100">
        {isLoading ? (
          <p className="px-5 py-6 text-sm text-slate-400">Loading…</p>
        ) : departments.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-400">No departments yet.</p>
        ) : (
          departments.map((d) =>
            editingId === d.id ? (
              <form
                key={d.id}
                onSubmit={(e) => { e.preventDefault(); update.mutate(d.id); }}
                className="flex flex-wrap items-end gap-3 px-5 py-3"
              >
                <div className="flex-1 min-w-[180px]">
                  <input
                    className={inputCls}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div className="w-32">
                  <input
                    className={inputCls}
                    value={editCode}
                    onChange={(e) => setEditCode(e.target.value)}
                    placeholder="Code"
                    maxLength={30}
                  />
                </div>
                <button
                  type="submit"
                  disabled={update.isPending || !editName.trim()}
                  className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
                >
                  {update.isPending ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <div key={d.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <span className="text-sm font-medium text-slate-800">{d.name}</span>
                  {d.code && (
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-500">
                      {d.code}
                    </span>
                  )}
                </div>
                {canEdit && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => startEdit(d)}
                      className="rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                    >
                      Edit
                    </button>
                    <ConfirmDeleteButton
                      onConfirm={() => destroy.mutate(d.id)}
                      disabled={destroy.isPending}
                    />
                  </div>
                )}
              </div>
            ),
          )
        )}
      </div>
    </div>
  );
}

// ── Positions section ─────────────────────────────────────────────────────

function PositionsSection({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();

  const { data: positions = [], isLoading } = useQuery({
    queryKey: ["positions"],
    queryFn: () => positionsApi.list(),
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: departmentsApi.list,
  });

  const [showAdd, setShowAdd] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addDeptId, setAddDeptId] = useState<number | "">("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDeptId, setEditDeptId] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["positions"] });

  const create = useMutation({
    mutationFn: () =>
      positionsApi.create({
        title: addTitle.trim(),
        department_id: addDeptId ? Number(addDeptId) : null,
      }),
    onSuccess: () => { invalidate(); setAddTitle(""); setAddDeptId(""); setShowAdd(false); setError(null); },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      setError(e.response?.data?.message ?? "Failed to create position."),
  });

  const update = useMutation({
    mutationFn: (id: number) =>
      positionsApi.update(id, {
        title: editTitle.trim(),
        department_id: editDeptId ? Number(editDeptId) : null,
      }),
    onSuccess: () => { invalidate(); setEditingId(null); setError(null); },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      setError(e.response?.data?.message ?? "Failed to update position."),
  });

  const destroy = useMutation({
    mutationFn: positionsApi.destroy,
    onSuccess: invalidate,
    onError: (e: { response?: { data?: { message?: string } } }) =>
      setError(e.response?.data?.message ?? "Failed to delete position."),
  });

  const startEdit = (p: Position) => {
    setEditingId(p.id);
    setEditTitle(p.title);
    setEditDeptId(p.department_id ?? "");
    setError(null);
  };

  const deptName = (id: number | null) =>
    departments.find((d) => d.id === id)?.name ?? "—";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="font-semibold text-slate-800">Positions</h2>
          <p className="text-xs text-slate-500 mt-0.5">{positions.length} position{positions.length !== 1 ? "s" : ""}</p>
        </div>
        {canEdit && (
          <button
            onClick={() => { setShowAdd((v) => !v); setError(null); }}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            {showAdd ? "Cancel" : "+ Add"}
          </button>
        )}
      </div>

      {error && (
        <div className="mx-5 mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      )}

      {showAdd && canEdit && (
        <form
          onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
          className="border-b border-slate-100 px-5 py-4"
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[180px]">
              <label className="mb-1 block text-xs font-medium text-slate-600">Title *</label>
              <input
                className={inputCls}
                value={addTitle}
                onChange={(e) => setAddTitle(e.target.value)}
                placeholder="e.g. HR Officer"
                required
              />
            </div>
            <div className="w-48">
              <label className="mb-1 block text-xs font-medium text-slate-600">Department</label>
              <select
                className={inputCls}
                value={addDeptId}
                onChange={(e) => setAddDeptId(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">None</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={create.isPending || !addTitle.trim()}
              className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
            >
              {create.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      )}

      <div className="divide-y divide-slate-100">
        {isLoading ? (
          <p className="px-5 py-6 text-sm text-slate-400">Loading…</p>
        ) : positions.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-400">No positions yet.</p>
        ) : (
          positions.map((p) =>
            editingId === p.id ? (
              <form
                key={p.id}
                onSubmit={(e) => { e.preventDefault(); update.mutate(p.id); }}
                className="flex flex-wrap items-end gap-3 px-5 py-3"
              >
                <div className="flex-1 min-w-[180px]">
                  <input
                    className={inputCls}
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div className="w-48">
                  <select
                    className={inputCls}
                    value={editDeptId}
                    onChange={(e) => setEditDeptId(e.target.value ? Number(e.target.value) : "")}
                  >
                    <option value="">None</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={update.isPending || !editTitle.trim()}
                  className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
                >
                  {update.isPending ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <div key={p.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <span className="text-sm font-medium text-slate-800">{p.title}</span>
                  <span className="ml-2 text-xs text-slate-400">{deptName(p.department_id)}</span>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => startEdit(p)}
                      className="rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                    >
                      Edit
                    </button>
                    <ConfirmDeleteButton
                      onConfirm={() => destroy.mutate(p.id)}
                      disabled={destroy.isPending}
                    />
                  </div>
                )}
              </div>
            ),
          )
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { data: me, isLoading } = useQuery({ queryKey: ["me"], queryFn: getMe });

  if (isLoading) return <p className="p-8 text-sm text-slate-500">Loading…</p>;

  const perms = me?.user.permissions ?? [];
  const hasAccess = canManage(perms);

  if (!hasAccess) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="text-sm font-medium text-slate-700">Access denied</p>
        <p className="mt-1 text-xs text-slate-400">
          Only HR and IT admins can manage master data.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <PageHeader
        title="Settings"
        description="Manage master data used across the system — departments and positions."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DepartmentsSection canEdit={hasAccess} />
        <PositionsSection canEdit={hasAccess} />
      </div>
    </div>
  );
}
