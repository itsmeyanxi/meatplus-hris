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

export type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  // Optional section header this item sits under in the sidebar. Items sharing a
  // group render together beneath that heading; items with no group render at the
  // top with no heading.
  group?: string;
  // Item shows only if the user has one of these roles (if set)…
  roles?: string[];
  // …and one of these permissions (if set). No gate = visible to everyone.
  permissions?: string[];
  // …and only if the user is linked to an employee record (if true).
  requiresEmployee?: boolean;
};

export type BackLink = { href: string; label: string };

/**
 * The application shell — sidebar, company switcher, mobile header, auth guard.
 * Both the HR module and the Payroll module render through this so they look
 * and behave identically; only the `nav`, `brandTitle` and optional `backLink`
 * differ per module.
 */
export function AppShell({
  nav,
  brandTitle,
  backLink,
  children,
}: {
  nav: NavItem[];
  brandTitle: string;
  backLink?: BackLink;
  children: ReactNode;
}) {
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

  const companyName = data?.user.active_company?.legal_name ?? brandTitle;

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
  const visibleNav = nav.filter(isAllowed);

  // Bucket the visible items into ordered sections by their `group`, keeping the
  // order in which groups first appear. Items with no group form a leading,
  // header-less section.
  const navGroups: { label: string; items: NavItem[] }[] = [];
  for (const item of visibleNav) {
    const label = item.group ?? "";
    const existing = navGroups.find((g) => g.label === label);
    if (existing) existing.items.push(item);
    else navGroups.push({ label, items: [item] });
  }

  // Page-level guard: if the current route maps to a nav item the user can't
  // access, block it here (defense-in-depth + clean UX). Backend still enforces.
  const currentItem = nav.find(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/"),
  );
  const routeAllowed = !data || !currentItem || isAllowed(currentItem);

  const BackToModule = backLink ? (
    <Link
      href={backLink.href}
      className="flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-900"
    >
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      {backLink.label}
    </Link>
  ) : null;

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
                <h1 className="text-base font-semibold tracking-tight text-slate-900 truncate">{brandTitle}</h1>
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

          {/* Back to the other module */}
          {BackToModule && !isCollapsed && <div className="px-1">{BackToModule}</div>}

          {/* Navigation Links, grouped into sections */}
          <nav className="space-y-1">
            {navGroups.map((groupDef, gi) => (
              <div key={groupDef.label || `_${gi}`} className={gi > 0 ? "pt-3" : undefined}>
                {groupDef.label &&
                  (isCollapsed ? (
                    gi > 0 && <div className="mx-2 mb-1 border-t border-slate-200/70" />
                  ) : (
                    <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {groupDef.label}
                    </p>
                  ))}
                <div className="space-y-1">
                  {groupDef.items.map((item) => {
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
                </div>
              </div>
            ))}
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
        <div className="sticky top-0 z-20 hidden items-center justify-end gap-1 border-b border-slate-200/80 bg-white/80 px-6 py-2 backdrop-blur lg:flex">
          <NotificationBell />
        </div>

        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur lg:hidden">
          <div className="space-y-3 px-4 py-3 sm:px-6">
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div>
                {BackToModule && <div className="mb-1">{BackToModule}</div>}
                <h1 className="text-base font-semibold tracking-tight text-slate-900">
                  {brandTitle}
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
