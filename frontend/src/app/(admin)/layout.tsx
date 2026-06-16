"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { getMe, logout } from "@/lib/auth";
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
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.364l-.707-.707M14 12a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    )
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
    roles: ["dept_head"],
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

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
    router.refresh();
  };

  const companyName = data?.user.active_company?.legal_name ?? "Meatplus HRIS";

  const userRoles = data?.user.roles ?? [];
  const userPermissions = data?.user.permissions ?? [];
  const hasEmployee = Boolean(data?.user.employee);
  const isAllowed = (item: NavItem) => {
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
                <p className="mt-0.5 text-[11px] text-slate-500 truncate max-w-[150px]">{companyName}</p>
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

        {/* User profile & Logout footer info */}
        <div className={`mt-auto border border-slate-200 bg-slate-50 p-2.5 transition-all ${isCollapsed ? "rounded-xl text-center" : "rounded-xl"}`}>
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
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Signed in</p>
              <p className="mt-0.5 break-all text-xs font-medium text-slate-900 line-clamp-2">
                {isLoading ? "Loading…" : data?.user.email}
              </p>
              <AppButton onClick={handleLogout} variant="secondary" className="mt-3 w-full text-xs py-1.5 h-auto">
                Log out
              </AppButton>
            </div>
          )}
        </div>
      </aside>

      {/* MOBILE HEADER & MAIN CONTENT */}
      <div className="min-w-0">
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