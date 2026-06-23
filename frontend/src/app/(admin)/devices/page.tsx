"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, AppButton, StatusBadge, TableShell } from "@/components/ui";
import { TableSkeleton, EmptyState } from "@/components/feedback";
import { useConfirm } from "@/components/ConfirmDialog";
import { inputCls, labelCls } from "@/lib/form-classes";
import { devicesApi, type Device, type DeviceInput, type SyncSummary, type EnrolledUser } from "@/lib/devices";

const QK = ["attendance-devices"];

function blankForm(): DeviceInput {
  return { name: "", ip_address: "", port: 80, timezone: "Asia/Manila", use_server_time: false, username: "", password: "", serial_no: "", is_active: true };
}

export default function DevicesPage() {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();

  const { data: devices, isLoading, isError } = useQuery({ queryKey: QK, queryFn: devicesApi.list });

  const [editing, setEditing] = useState<Device | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<DeviceInput>(blankForm());
  const [busyId, setBusyId] = useState<number | null>(null);
  const [enrolled, setEnrolled] = useState<{ device: Device; users: EnrolledUser[] } | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm(blankForm());
    setShowForm(true);
  };
  const openEdit = (d: Device) => {
    setEditing(d);
    setForm({
      name: d.name,
      ip_address: d.ip_address,
      port: d.port,
      timezone: d.timezone ?? "Asia/Manila",
      use_server_time: d.use_server_time,
      username: d.username,
      password: "", // blank = keep
      serial_no: d.serial_no ?? "",
      is_active: d.is_active,
    });
    setShowForm(true);
  };

  const save = useMutation({
    mutationFn: () => (editing ? devicesApi.update(editing.id, form) : devicesApi.create(form)),
    meta: { successMessage: editing ? "Device updated." : "Device added." },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      setShowForm(false);
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => devicesApi.remove(id),
    meta: { successMessage: "Device removed." },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });

  const onTest = async (d: Device) => {
    setBusyId(d.id);
    try {
      const res = await devicesApi.test(d.id);
      toast.success(`${d.name}: reachable — ${res.info?.model ?? "device"} (SN ${res.info?.serial ?? "?"})`);
      qc.invalidateQueries({ queryKey: QK });
    } catch {
      /* global error toast handles the message */
    } finally {
      setBusyId(null);
    }
  };

  const onEnrolled = async (d: Device) => {
    setBusyId(d.id);
    try {
      const users = await devicesApi.users(d.id);
      setEnrolled({ device: d, users });
    } catch {
      /* global error toast */
    } finally {
      setBusyId(null);
    }
  };

  const onSync = async (d: Device) => {
    setBusyId(d.id);
    try {
      const res = await devicesApi.sync(d.id);
      summarize(res.summary);
      qc.invalidateQueries({ queryKey: QK });
    } catch {
      /* global error toast */
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (d: Device) => {
    if (await confirm({ title: "Remove device?", message: `${d.name} (${d.ip_address}) will be removed. Existing punches are kept.`, confirmLabel: "Remove", danger: true })) {
      remove.mutate(d.id);
    }
  };

  return (
    <div className="space-y-6">
      {dialog}
      <PageHeader
        title="Biometric Devices"
        description="Register and sync fingerprint/face attendance terminals."
        actions={<AppButton onClick={openCreate}>+ Add device</AppButton>}
      />

      <EnrollmentHelp />

      {isLoading ? (
        <TableShell><TableSkeleton rows={3} cols={6} /></TableShell>
      ) : isError ? (
        <EmptyState title="Couldn't load devices" message="Please retry in a moment." />
      ) : !devices || devices.length === 0 ? (
        <EmptyState
          title="No devices yet"
          message="Add your biometric terminal to start pulling punches automatically."
          action={<AppButton onClick={openCreate}>+ Add device</AppButton>}
        />
      ) : (
        <TableShell>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Device</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">Serial</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last sync</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {devices.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-medium text-slate-800">{d.name}</td>
                  <td className="px-4 py-3 font-mono text-slate-600">{d.ip_address}:{d.port}</td>
                  <td className="px-4 py-3 text-slate-500">{d.serial_no ?? "—"}</td>
                  <td className="px-4 py-3"><StatusBadge active={d.is_active}>{d.is_active ? "Active" : "Disabled"}</StatusBadge></td>
                  <td className="px-4 py-3 text-slate-500">{fmt(d.last_synced_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <SmallBtn onClick={() => onTest(d)} disabled={busyId === d.id}>Test</SmallBtn>
                      <SmallBtn onClick={() => onEnrolled(d)} disabled={busyId === d.id}>Enrolled</SmallBtn>
                      <SmallBtn onClick={() => onSync(d)} disabled={busyId === d.id}>{busyId === d.id ? "…" : "Sync"}</SmallBtn>
                      <SmallBtn onClick={() => openEdit(d)}>Edit</SmallBtn>
                      <SmallBtn onClick={() => onDelete(d)} danger>Delete</SmallBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      )}

      {showForm && (
        <DeviceFormModal
          editing={editing}
          form={form}
          setForm={setForm}
          onClose={() => setShowForm(false)}
          onSubmit={() => save.mutate()}
          saving={save.isPending}
        />
      )}

      {enrolled && <EnrolledModal device={enrolled.device} users={enrolled.users} onClose={() => setEnrolled(null)} />}
    </div>
  );
}

function EnrolledModal({ device, users, onClose }: { device: Device; users: EnrolledUser[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal>
      <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">Enrolled on {device.name}</h2>
        <p className="mt-1 text-sm text-slate-500">
          People stored on the terminal. Match each to an HRIS employee by setting that employee&apos;s Biometric ID to
          the device&apos;s Employee No.
        </p>

        {users.length === 0 ? (
          <p className="mt-6 text-sm text-slate-500">No users enrolled on this device.</p>
        ) : (
          <div className="mt-4 max-h-80 overflow-y-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5">Device Employee No.</th>
                  <th className="px-4 py-2.5">Device name</th>
                  <th className="px-4 py-2.5">HRIS match</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.device_employee_no}>
                    <td className="px-4 py-2.5 font-mono font-medium text-slate-800">{u.device_employee_no}</td>
                    <td className="px-4 py-2.5 text-slate-600">{u.device_name ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      {u.matched_employee ? (
                        <span className="text-emerald-700">
                          {u.matched_employee.name}{" "}
                          <span className="text-slate-400">({u.matched_employee.employee_no})</span>
                        </span>
                      ) : (
                        <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                          Unmatched
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <AppButton variant="secondary" onClick={onClose}>Close</AppButton>
        </div>
      </div>
    </div>
  );
}

function summarize(s?: SyncSummary) {
  if (!s) {
    toast.success("Sync complete.");
    return;
  }
  const unmapped = Object.keys(s.unmapped ?? {}).length;
  toast.success(
    `${s.device}: ${s.inserted} new punch(es), ${s.employees_recomputed} DTR(s) recomputed` +
      (unmapped ? ` — ${unmapped} unmapped ID(s)` : ""),
  );
}

function fmt(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString();
}

function SmallBtn({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition disabled:opacity-40 ${
        danger
          ? "border-red-200 text-red-600 hover:bg-red-50"
          : "border-slate-200 text-slate-600 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

function DeviceFormModal({
  editing,
  form,
  setForm,
  onClose,
  onSubmit,
  saving,
}: {
  editing: Device | null;
  form: DeviceInput;
  setForm: (f: DeviceInput) => void;
  onClose: () => void;
  onSubmit: () => void;
  saving: boolean;
}) {
  const set = <K extends keyof DeviceInput>(k: K, v: DeviceInput[K]) => setForm({ ...form, [k]: v });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">{editing ? "Edit device" : "Add device"}</h2>
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <div>
            <label className={labelCls}>Name</label>
            <input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Main Entrance" required />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>IP address</label>
              <input className={inputCls} value={form.ip_address} onChange={(e) => set("ip_address", e.target.value)} placeholder="192.168.110.8" required />
            </div>
            <div>
              <label className={labelCls}>Port</label>
              <input className={inputCls} type="number" value={form.port} onChange={(e) => set("port", Number(e.target.value))} required />
            </div>
          </div>
          <div>
            <label className={labelCls}>Device timezone</label>
            <input className={inputCls} value={form.timezone} onChange={(e) => set("timezone", e.target.value)} placeholder="Asia/Manila" required />
            <p className="mt-1 text-xs text-slate-400">Must match the terminal&apos;s clock — punches are read in this zone.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Admin username</label>
              <input className={inputCls} value={form.username} onChange={(e) => set("username", e.target.value)} placeholder="admin" required autoComplete="off" />
            </div>
            <div>
              <label className={labelCls}>Admin password</label>
              <input
                className={inputCls}
                type="password"
                value={form.password ?? ""}
                onChange={(e) => set("password", e.target.value)}
                placeholder={editing ? "•••••• (unchanged)" : ""}
                required={!editing}
                autoComplete="new-password"
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Serial no. (optional)</label>
            <input className={inputCls} value={form.serial_no ?? ""} onChange={(e) => set("serial_no", e.target.value)} placeholder="Auto-filled on Test" />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} />
            Active (included in scheduled sync)
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-0.5" checked={form.use_server_time} onChange={(e) => set("use_server_time", e.target.checked)} />
            <span>
              Use server time for punches <span className="text-slate-400">(testing)</span>
              <span className="block text-xs text-slate-400">Anchors punches to this server&apos;s clock instead of the device&apos;s time — for when the terminal clock is off.</span>
            </span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <AppButton type="button" variant="secondary" onClick={onClose}>Cancel</AppButton>
            <AppButton type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Add device"}</AppButton>
          </div>
        </form>
      </div>
    </div>
  );
}

function EnrollmentHelp() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-sky-100 bg-sky-50/60 p-4 text-sm text-slate-700">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-left font-medium text-sky-900">
        <span>How connecting &amp; enrollment matching works</span>
        <span className="text-xs text-sky-700">{open ? "Hide" : "Read"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3 leading-relaxed">
          <p>
            <strong>Network:</strong> the HRIS server must be on the same network as the terminal and able to reach
            it over HTTP (the IP and port above). Use <em>Test</em> to confirm the address and admin credentials.
            Once it works, the server polls the device every 5 minutes and pulls new scans automatically.
          </p>
          <p>
            <strong>Enrollment match:</strong> the terminal stores each person under an <em>“Employee No.”</em>. The
            sync matches that against each HRIS employee&apos;s <span className="font-mono">biometric_user_id</span>
            (or, if that&apos;s blank, their <span className="font-mono">employee_no</span>). So enroll a person on the
            device using their HRIS employee number — or set the employee&apos;s Biometric ID on their profile. Scans
            that don&apos;t match anyone are reported as <em>unmapped</em> and skipped, never lost.
          </p>
        </div>
      )}
    </div>
  );
}
