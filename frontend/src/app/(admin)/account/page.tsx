"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { changePassword, getMe } from "@/lib/auth";
import { getRoles, ROLE_LABELS } from "@/lib/users";
import { AppButton } from "@/components/ui";
import { inputCls, labelCls } from "@/lib/form-classes";
import { COASection } from "@/components/coa/COASection";

// ── Permission category metadata ──────────────────────────────────────────

const PERM_CATEGORIES: Record<string, { label: string; cls: string }> = {
  leave:          { label: "Leave",          cls: "bg-teal-50 text-teal-700 border-teal-200" },
  attendance:     { label: "Attendance",     cls: "bg-blue-50 text-blue-700 border-blue-200" },
  payroll:        { label: "Payroll",        cls: "bg-violet-50 text-violet-700 border-violet-200" },
  compensation:   { label: "Compensation",   cls: "bg-purple-50 text-purple-700 border-purple-200" },
  employee:       { label: "Employee",       cls: "bg-amber-50 text-amber-700 border-amber-200" },
  user:           { label: "Users",          cls: "bg-rose-50 text-rose-700 border-rose-200" },
  role:           { label: "Roles",          cls: "bg-rose-50 text-rose-700 border-rose-200" },
  access_request: { label: "Access",        cls: "bg-orange-50 text-orange-700 border-orange-200" },
  gov_report:     { label: "Gov. Reports",   cls: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  device:         { label: "Devices",        cls: "bg-slate-100 text-slate-600 border-slate-200" },
  audit:          { label: "Audit",          cls: "bg-slate-100 text-slate-600 border-slate-200" },
  company:        { label: "Company",        cls: "bg-slate-100 text-slate-600 border-slate-200" },
};

function groupPermissions(perms: string[]) {
  const groups: Record<string, string[]> = {};
  for (const p of perms) {
    const prefix = p.split(".")[0];
    if (!groups[prefix]) groups[prefix] = [];
    groups[prefix].push(p);
  }
  return groups;
}

// ── View-as role control ──────────────────────────────────────────────────

function ViewAsCard({ roles }: { roles: { name: string; permissions: string[] }[] }) {
  const [value, setValue] = useState<string>(() =>
    typeof window !== "undefined" ? (localStorage.getItem("previewRole") ?? "") : "",
  );

  const handleChange = (role: string) => {
    setValue(role);
    if (role) localStorage.setItem("previewRole", role);
    else localStorage.removeItem("previewRole");
    window.dispatchEvent(new CustomEvent("preview-role-change", { detail: role || null }));
  };

  const isActive = Boolean(value);

  return (
    <Card label="View as role" icon={<EyeIcon />}>
      <p className="mb-4 text-sm text-slate-500 leading-relaxed">
        Simulate how the application looks to users with a specific role. Navigation and permissions update immediately — your actual access is unchanged.
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {/* "My view" reset option */}
        <button
          type="button"
          onClick={() => handleChange("")}
          className={[
            "flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition",
            !isActive
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
          ].join(" ")}
        >
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${!isActive ? "bg-white/15" : "bg-slate-100"}`}>
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </span>
          <div>
            <p className="text-sm font-semibold">My view</p>
            <p className={`text-xs ${!isActive ? "text-white/60" : "text-slate-400"}`}>IT Admin — full access</p>
          </div>
          {!isActive && (
            <svg className="ml-auto h-4 w-4 shrink-0 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
            </svg>
          )}
        </button>

        {/* Role options */}
        {roles.filter((r) => r.name !== "it_admin").map((r) => {
          const active = value === r.name;
          const label  = ROLE_LABELS[r.name as keyof typeof ROLE_LABELS] ?? r.name.replace(/_/g, " ");
          return (
            <button
              key={r.name}
              type="button"
              onClick={() => handleChange(r.name)}
              className={[
                "flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition",
                active
                  ? "border-amber-400 bg-amber-50 text-amber-900"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
              ].join(" ")}
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${active ? "bg-amber-200" : "bg-slate-100"}`}>
                <svg className={`h-3.5 w-3.5 ${active ? "text-amber-700" : "text-slate-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold capitalize">{label}</p>
                <p className={`text-xs ${active ? "text-amber-600" : "text-slate-400"}`}>{r.permissions.length} permissions</p>
              </div>
              {active && (
                <svg className="ml-auto h-4 w-4 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
                </svg>
              )}
            </button>
          );
        })}
      </div>

      {isActive && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <svg className="h-4 w-4 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <span>Previewing as <strong>{ROLE_LABELS[value as keyof typeof ROLE_LABELS] ?? value}</strong>. Your real access is unchanged.</span>
        </div>
      )}
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function AccountPage() {
  const { data: meData, isLoading } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const isItAdmin = meData?.user.roles.includes("it_admin") ?? false;
  const { data: rolesData = [] } = useQuery({
    queryKey: ["roles-with-perms"],
    queryFn: getRoles,
    enabled: isItAdmin,
    staleTime: 5 * 60_000,
  });

  if (isLoading || !meData) {
    return <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  const { user } = meData;
  const isAdmin    = user.roles.includes("it_admin");
  const perms      = user.permissions ?? [];
  const isHR       = perms.includes("attendance.view.any") || perms.includes("attendance.manage");
  const isApprover = !isHR && (perms.includes("attendance.approve.any") || perms.includes("attendance.approve.self_dept"));
  const canManage  = perms.includes("attendance.manage");
  const employeeId = user.employee?.id ?? null;
  const displayName = user.employee?.full_name ?? user.name ?? user.email;
  const initials = displayName
    .split(" ").filter(Boolean).slice(0, 2)
    .map((w: string) => w[0].toUpperCase()).join("");
  const permGroups = groupPermissions(user.permissions);
  const hireDate = user.employee?.date_hired
    ? new Date(user.employee.date_hired).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })
    : null;

  return (
    <div className="space-y-5">

      {/* ── Profile banner ──────────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-2xl bg-slate-900 px-6 py-7"
        style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.07) 1px, transparent 0)", backgroundSize: "28px 28px" }}
      >
        {/* soft glow behind avatar */}
        <div className="pointer-events-none absolute -left-10 -top-10 h-48 w-48 rounded-full bg-white/5 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-40 w-64 bg-gradient-to-tl from-white/5 to-transparent" />

        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          {/* Avatar */}
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-2xl font-bold text-white ring-1 ring-white/20">
            {initials}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-white">{displayName}</h1>
              {user.is_active
                ? <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-400 ring-1 ring-emerald-500/30"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Active</span>
                : <span className="flex items-center gap-1 rounded-full bg-slate-500/20 px-2 py-0.5 text-xs font-medium text-slate-400 ring-1 ring-slate-500/30"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" />Inactive</span>
              }
            </div>

            {user.employee && (
              <p className="mt-1 text-sm text-slate-400">
                {[user.employee.position, user.employee.department].filter(Boolean).join(" · ")}
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-1.5">
              {user.roles.map((r) => (
                <span key={r} className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white/75 ring-1 ring-white/15">
                  {ROLE_LABELS[r as keyof typeof ROLE_LABELS] ?? r.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          </div>

          {/* Employee no chip */}
          {user.employee && (
            <div className="shrink-0 rounded-xl bg-white/8 px-4 py-3 text-center ring-1 ring-white/10 sm:text-right">
              <p className="font-mono text-xs text-slate-500 uppercase tracking-widest">Employee</p>
              <p className="mt-0.5 font-mono text-lg font-semibold text-white">{user.employee.employee_no}</p>
              {hireDate && <p className="mt-0.5 text-xs text-slate-500">Since {hireDate}</p>}
            </div>
          )}
        </div>
      </div>

      {/* ── Main grid ───────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">

        {/* Left column: info cards */}
        <div className="space-y-4">

          {/* Account */}
          <Card label="Account details">
            <InfoRow icon={<EmailIcon />}    label="Email"      value={user.email} />
            <InfoRow icon={<ClockIcon />}    label="Last login" value={user.last_login_at ? new Date(user.last_login_at).toLocaleString("en-PH") : "—"} />
            {user.active_company && (
              <InfoRow icon={<BuildingIcon />} label="Company" value={user.active_company.legal_name} />
            )}
          </Card>

          {/* Employee */}
          <Card label="Employee profile">
            {user.employee ? (
              <>
                {user.employee.position   && <InfoRow icon={<BriefcaseIcon />} label="Position"   value={user.employee.position} />}
                {user.employee.department && <InfoRow icon={<GridIcon />}      label="Department" value={user.employee.department} />}
                {hireDate                  && <InfoRow icon={<CalendarIcon />}  label="Date hired" value={hireDate} />}
              </>
            ) : (
              <p className="py-4 text-center text-sm text-slate-400">No employee record linked.</p>
            )}
          </Card>
        </div>

        {/* Right column: security */}
        <Card label="Security" icon={<LockIcon />} accent>
          <p className="mb-5 text-sm text-slate-500 leading-relaxed">
            Use a strong password with uppercase, lowercase, and numbers. Min. 8 characters.
          </p>
          <ChangePasswordForm />
        </Card>
      </div>

      {/* ── Permissions (admin only) ─────────────────────────────── */}
      {isAdmin && (
        <Card label={`Permissions — ${user.permissions.length} total`}>
          <div className="space-y-5">
            {Object.entries(permGroups).map(([prefix, perms]) => {
              const meta = PERM_CATEGORIES[prefix] ?? { label: prefix, cls: "bg-slate-100 text-slate-600 border-slate-200" };
              return (
                <div key={prefix}>
                  <span className={`mb-2.5 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${meta.cls}`}>
                    {meta.label}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {perms.map((p) => (
                      <span key={p} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs text-slate-600">
                        {p.replace(`${prefix}.`, ".")}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── View as role (IT Admin only) ─────────────────────────── */}
      {isAdmin && rolesData.length > 0 && <ViewAsCard roles={rolesData} />}

      {/* ── Certificates of Attendance ───────────────────────────── */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
          </svg>
          <h3 className="text-sm font-semibold text-slate-800">Certificates of Attendance</h3>
        </div>
        <COASection
          employeeId={employeeId}
          isHR={isHR}
          isApprover={isApprover}
          canManage={canManage}
          meData={meData}
        />
      </div>
    </div>
  );
}

// ── Change password form ─────────────────────────────────────────────────

function ChangePasswordForm() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ current_password: "", password: "", password_confirmation: "" });
  const [success, setSuccess] = useState(false);

  const mutation = useMutation({
    mutationFn: () => changePassword(form),
    onSuccess: () => {
      setForm({ current_password: "", password: "", password_confirmation: "" });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });

  const apiErr = mutation.error as { response?: { data?: { errors?: Record<string, string[]>; message?: string } } } | null;
  const fieldErrors = apiErr?.response?.data?.errors ?? {};
  const generalError = apiErr?.response?.data?.message;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); setSuccess(false); mutation.mutate(); }} className="space-y-3">
      <div>
        <label className={labelCls}>Current password</label>
        <input type="password" className={inputCls} placeholder="••••••••" value={form.current_password} onChange={set("current_password")} required autoComplete="current-password" />
        {fieldErrors.current_password && <p className="mt-1 text-xs text-red-500">{fieldErrors.current_password[0]}</p>}
      </div>
      <div>
        <label className={labelCls}>New password</label>
        <input type="password" className={inputCls} placeholder="••••••••" value={form.password} onChange={set("password")} required autoComplete="new-password" />
        {fieldErrors.password && <p className="mt-1 text-xs text-red-500">{fieldErrors.password[0]}</p>}
      </div>
      <div>
        <label className={labelCls}>Confirm new password</label>
        <input type="password" className={inputCls} placeholder="••••••••" value={form.password_confirmation} onChange={set("password_confirmation")} required autoComplete="new-password" />
      </div>

      {generalError && (
        <div className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700 border border-red-100">{generalError}</div>
      )}
      {success && (
        <div className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm font-medium text-emerald-700 border border-emerald-100">
          Password updated successfully.
        </div>
      )}

      <div className="pt-1">
        <AppButton type="submit" disabled={mutation.isPending} className="w-full justify-center">
          {mutation.isPending ? "Updating…" : "Update password"}
        </AppButton>
      </div>
    </form>
  );
}

// ── UI primitives ────────────────────────────────────────────────────────

function Card({ label, icon, accent = false, children }: { label: string; icon?: React.ReactNode; accent?: boolean; children: React.ReactNode }) {
  return (
    <section className={`rounded-2xl border bg-white/90 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur ${accent ? "border-slate-200 bg-slate-50/40" : "border-slate-200"}`}>
      <div className="mb-4 flex items-center gap-2">
        {icon && <span className="text-slate-400">{icon}</span>}
        <h3 className="text-sm font-semibold text-slate-800">{label}</h3>
      </div>
      {children}
    </section>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 py-2.5 last:border-0">
      <span className="shrink-0 text-slate-400">{icon}</span>
      <span className="flex-1 text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-900 text-right">{value}</span>
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────

const iconProps = { className: "h-4 w-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 1.75 };

function EmailIcon()    { return <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>; }
function ClockIcon()    { return <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>; }
function BuildingIcon() { return <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>; }
function BriefcaseIcon(){ return <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>; }
function GridIcon()     { return <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>; }
function CalendarIcon() { return <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5m-9-6h.008v.008H12V12zm0 3h.008v.008H12V15zm0 3h.008v.008H12V18zm3-6h.008v.008H15V12zm0 3h.008v.008H15V15zm0 3h.008v.008H15V18zm-6-6h.008v.008H9V12zm0 3h.008v.008H9V15zm0 3h.008v.008H9V18z" /></svg>; }
function LockIcon()     { return <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>; }
function EyeIcon()      { return <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>; }
