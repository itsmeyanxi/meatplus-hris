"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { getMe, logout, switchCompany } from "@/lib/auth";
import { getRoles, ROLE_LABELS } from "@/lib/users";
import { getCompanies } from "@/lib/companies";
import { AppButton } from "@/components/ui";
import { NotificationBell } from "@/components/NotificationBell";

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  // Item shows only if the user has one of these roles (if set)…
  roles?: string[];
  // …and one of these permissions (if set). No gate = visible to everyone.
  permissions?: string[];
  // …and only if the user is linked to an employee record (if true).
  requiresEmployee?: boolean;
};

const NAV: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard", 
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 3.055A9.003 9.003 0 1020.945 13H11V3.055z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
      </svg>
    )
  },
  {
    href: "/employees",
    label: "Employees",
    permissions: ["employee.view"],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    )
  },
  {
    href: "/notifications",
    label: "Notifications",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
  },
  {
    href: "/reports",
    label: "Reports",
    permissions: ["attendance.view"],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    href: "/companies",
    label: "Companies",
    roles: ["it_admin"],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    href: "/attendance",
    label: "Attendance",
    permissions: ["attendance.view"],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    )
  },
  {
    href: "/leaves",
    label: "Leaves",
    permissions: ["leave.file", "leave.view", "leave.approve.any", "leave.approve.self_dept", "leave.manage_types"],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.364l-.707-.707M14 12a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    )
  },
  {
    href: "/overtimes",
    label: "Overtimes",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    href: "/undertimes",
    label: "Undertimes",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6" />
      </svg>
    ),
  },
  {
    href: "/official-businesses",
    label: "Official Business",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    href: "/schedule-adjustments",
    label: "Schedule Adjustment",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l2 2 4-4" />
      </svg>
    ),
  },
  {
    href: "/payroll",
    label: "Payroll",
    permissions: ["payroll.view"],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 8h6m-6 4h6m-7 8h8a2 2 0 002-2V6a2 2 0 00-2-2H8a2 2 0 00-2 2v12a2 2 0 002 2z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 14.5V16m0-9v1.5m1.5 0h-2.25a1.25 1.25 0 000 2.5h1.5a1.25 1.25 0 010 2.5H10.5" />
      </svg>
    )
  },
  {
    href: "/final-pay",
    label: "Final Pay",
    permissions: ["leave.approve.any"],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    href: "/users",
    label: "Users",
    permissions: ["user.manage"],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    )
  },
  {
    href: "/my-attendance",
    label: "My Attendance",
    requiresEmployee: true,
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 16l2 2 4-4" />
      </svg>
    )
  },
  {
    href: "/request-access",
    label: "Request Access",
    requiresEmployee: true,
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )
  },
  {
    href: "/access-requests",
    label: "Access Requests",
    permissions: ["access_request.view"],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  },
  {
    href: "/devices",
    label: "Devices",
    permissions: ["device.manage"],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
      </svg>
    )
  },
  {
    href: "/settings",
    label: "Settings",
    permissions: ["employee.update", "user.manage"],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    )
  },
  {
    href: "/account",
    label: "Account",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    )
  },



];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
  });

  useEffect(() => {
    if (isError) router.replace("/login");
  }, [isError, router]);

  // --- "View as role" preview (IT Admin only) ---
  const realRoles = data?.user.roles ?? [];
  const isItAdmin = realRoles.includes("it_admin");

  const [previewRole, setPreviewRole] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem("previewRole") : null,
  );
  const changePreview = (role: string | null) => {
    setPreviewRole(role);
    if (role) localStorage.setItem("previewRole", role);
    else localStorage.removeItem("previewRole");
    window.dispatchEvent(new CustomEvent("preview-role-change", { detail: role }));
  };

  useEffect(() => {
    const handler = (e: Event) => setPreviewRole((e as CustomEvent<string | null>).detail);
    window.addEventListener("preview-role-change", handler);
    return () => window.removeEventListener("preview-role-change", handler);
  }, []);

  const { data: rolesData } = useQuery({
    queryKey: ["roles-with-perms"],
    queryFn: getRoles,
    enabled: isItAdmin,
    staleTime: 5 * 60_000,
  });

  // Resolve the previewed role's permission set; until it loads, stay on real access.
  const previewEntry = isItAdmin && previewRole ? rolesData?.find((r) => r.name === previewRole) : undefined;

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
    router.refresh();
  };

  const companyName = data?.user.active_company?.legal_name ?? "Meatplus HRIS";

  const [companyOpen, setCompanyOpen] = useState(false);
  const [switchingId, setSwitchingId] = useState<number | null>(null);

  // Original company is the home company locked in on first switch — can never return there.
  const originalCompanyId = data?.user.original_company_id ?? null;
  // An IT account is either currently it_admin or has previously switched away (has original_company_id).
  const isItAccount = isItAdmin || originalCompanyId !== null;

  const { data: companiesData } = useQuery({
    queryKey: ["companies-list"],
    queryFn: getCompanies,
    enabled: isItAccount,
    staleTime: 60_000,
  });

  // Exclude the home company from the switcher — once you leave, you can't go back.
  const switchableCompanies = companiesData?.filter((c) => c.id !== originalCompanyId) ?? [];

  const handleSwitchCompany = async (id: number) => {
    if (id === data?.user.active_company?.id) { setCompanyOpen(false); return; }
    setSwitchingId(id);
    try {
      await switchCompany(id);
      window.location.reload();
    } finally {
      setSwitchingId(null);
      setCompanyOpen(false);
    }
  };

  const userRoles = previewEntry ? [previewEntry.name] : realRoles;
  const userPermissions = previewEntry ? previewEntry.permissions : (data?.user.permissions ?? []);
  const hasEmployee = Boolean(data?.user.employee);
  // IT admin always sees everything (unless previewing as another role).
  const isAllowed = (item: NavItem) => {
    if (isItAdmin && !previewEntry) return true;
    const roleOk = !item.roles || item.roles.some((r) => userRoles.includes(r));
    const permOk =
      !item.permissions ||
      item.permissions.some((p) => userPermissions.includes(p));
    const employeeOk = !item.requiresEmployee || hasEmployee;
    return roleOk && permOk && employeeOk;
  };
  const visibleNav = NAV.filter(isAllowed);

  // Page-level guard: if the current route maps to a nav item the user can't
  // access, block it here (defense-in-depth + clean UX). Backend still enforces.
  const currentItem = NAV.find(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/"),
  );
  const routeAllowed = !data || !currentItem || isAllowed(currentItem);

  return (
    <div 
      className={`min-h-screen bg-[color:var(--background)] lg:grid transition-all duration-300 ${
        isCollapsed ? "lg:grid-cols-[72px_minmax(0,1fr)]" : "lg:grid-cols-[240px_minmax(0,1fr)]"
      }`}
    >
      {/* DESKTOP SIDEBAR */}
      <aside className="hidden border-r border-slate-200/80 bg-white/90 px-3.5 py-6 backdrop-blur lg:flex lg:min-h-screen lg:flex-col justify-between transition-all duration-300">
        <div className="space-y-6">
          {/* Header & Toggle Button */}
          <div className="flex items-center justify-between gap-1.5 px-1">
            {!isCollapsed && (
              <div className="transition-opacity duration-200 min-w-0">
                <h1 className="text-base font-semibold tracking-tight text-slate-900 truncate">Meatplus HRIS</h1>
                {isItAccount && switchableCompanies.length > 1 ? (
                  <div className="relative">
                    <button
                      onClick={() => setCompanyOpen((o) => !o)}
                      className="mt-0.5 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 truncate max-w-[150px]"
                    >
                      <span className="truncate">{companyName}</span>
                      <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {companyOpen && (
                      <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                        {switchableCompanies.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => handleSwitchCompany(c.id)}
                            disabled={switchingId !== null}
                            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50 ${
                              c.id === data?.user.active_company?.id ? "font-semibold text-slate-900" : "text-slate-600"
                            }`}
                          >
                            {switchingId === c.id ? (
                              <span className="h-2 w-2 animate-spin rounded-full border border-slate-400 border-t-transparent" />
                            ) : c.id === data?.user.active_company?.id ? (
                              <svg className="h-2 w-2 fill-slate-900" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" /></svg>
                            ) : (
                              <span className="h-2 w-2" />
                            )}
                            {c.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="mt-0.5 text-xs text-slate-500 truncate max-w-[150px]">{companyName}</p>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 mx-auto transition shrink-0"
              title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              <svg className="w-4 h-4 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={isCollapsed ? "M13 5l7 7-7 7M5 5l7 7-7 7" : "M11 19l-7-7 7-7M19 19l-7-7 7-7"} />
              </svg>
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {visibleNav.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={isCollapsed ? item.label : undefined}
                  className={
                    active
                      ? `flex items-center rounded-xl border border-slate-900 bg-slate-900 py-2 text-sm font-medium text-white shadow-sm transition-all ${
                          isCollapsed ? "justify-center px-0" : "px-2.5 gap-2.5"
                        }`
                      : `flex items-center rounded-xl py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 ${
                          isCollapsed ? "justify-center px-0" : "px-2.5 gap-2.5"
                        }`
                  }
                >
                  <span className="shrink-0 scale-95">{item.icon}</span>
                  {!isCollapsed && <span className="transition-opacity duration-200 truncate">{item.label}</span>}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto space-y-2.5">
          {/* User profile & Logout footer info */}
          <div className={`border border-slate-200 bg-slate-50 p-2.5 transition-all ${isCollapsed ? "rounded-xl text-center" : "rounded-xl"}`}>
            {isCollapsed ? (
              <button
                onClick={handleLogout}
                className="text-slate-500 hover:text-red-600 transition p-1"
                title="Log out"
              >
                <svg className="w-4 h-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            ) : (
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Signed in</p>
                <p className="mt-0.5 break-all text-xs font-medium text-slate-900 line-clamp-2">
                  {isLoading ? "Loading…" : data?.user.email}
                </p>
                <AppButton onClick={handleLogout} variant="secondary" className="mt-3 w-full text-xs py-1.5 h-auto">
                  Log out
                </AppButton>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* MOBILE HEADER & MAIN CONTENT */}
      <div className="min-w-0">
        {/* Preview banner */}
        {previewEntry && (
          <div className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-amber-500 px-4 py-1.5 text-sm text-white sm:px-6">
            <span className="truncate">
              Previewing as <strong>{ROLE_LABELS[previewEntry.name] ?? previewEntry.name}</strong> — navigation reflects this role. Your real access is unchanged.
            </span>
            <button onClick={() => changePreview(null)} className="shrink-0 font-medium underline underline-offset-2 hover:no-underline">
              Exit preview
            </button>
          </div>
        )}

        {/* Desktop top bar */}
        <div className="sticky top-0 z-20 hidden items-center justify-end border-b border-slate-200/80 bg-white/80 px-6 py-2 backdrop-blur lg:flex">
          <NotificationBell />
        </div>

        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur lg:hidden">
          <div className="space-y-3 px-4 py-3 sm:px-6">
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div>
                <h1 className="text-base font-semibold tracking-tight text-slate-900">
                  Meatplus HRIS
                </h1>
                <p className="mt-0.5 text-xs text-slate-500">{companyName}</p>
              </div>
              <div className="flex items-center gap-1">
                <NotificationBell />
                <AppButton onClick={handleLogout} variant="secondary" className="shrink-0">
                  Log out
                </AppButton>
              </div>
            </div>

            <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {visibleNav.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={
                      active
                        ? "whitespace-nowrap rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm"
                        : "whitespace-nowrap rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
                    }
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <p className="text-xs text-slate-500 break-words">{isLoading ? "Loading…" : data?.user.email}</p>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {routeAllowed ? children : <AccessDenied />}
        </main>
      </div>
    </div>
  );
}

function RolePreviewControl({
  value,
  roles,
  onChange,
}: {
  value: string | null;
  roles: { name: string; permissions: string[] }[];
  onChange: (role: string | null) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        View as
      </p>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className={`w-full rounded-lg border px-2.5 py-1.5 text-sm font-medium outline-none transition focus:ring-2 focus:ring-slate-900 ${
          value ? "border-amber-400 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-700"
        }`}
      >
        <option value="">My view (IT Admin)</option>
        {roles
          .filter((r) => r.name !== "it_admin")
          .map((r) => (
            <option key={r.name} value={r.name}>
              {ROLE_LABELS[r.name as keyof typeof ROLE_LABELS] ?? r.name}
            </option>
          ))}
      </select>
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white/90 p-8 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m0-6a9 9 0 110 18 9 9 0 010-18zm0 0V9m-7.071 1.929a10 10 0 0114.142 0" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-slate-900">Access denied</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
        You don&apos;t have permission to view this page.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
      >
        Back to dashboard
      </Link>
    </div>
  );
}