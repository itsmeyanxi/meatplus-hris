"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { getNotifications, markNotificationRead, type AppNotification } from "@/lib/notifications";

/**
 * "What needs fixing" — a centred dialog shown once a day when someone enters the app.
 *
 * The bell was not enough on its own. Over one eight-day stretch the daily biometric
 * digest went to ten people and was opened twice; five of them signed in on a day they
 * had an unread digest sitting in the bell and walked straight past it. Two PIN-reuse
 * collisions stayed unfixed for nearly three weeks as a result, quietly crediting one
 * employee's punches to another. A badge cannot be missed on purpose; it just is.
 *
 * So the outstanding work is put in front of the person once, at the start of their day,
 * and then gets out of the way:
 *  - shown ONLY when something is actually outstanding (never an empty "all clear")
 *  - once per user per calendar day (Manila), not on every page navigation
 *  - dismissible by button, Escape or backdrop — it informs, it does not hold the app
 *    hostage the way ForcePasswordChange deliberately does
 */

/** Notification types that represent work, ordered by how much it costs to ignore them. */
const ACTIONABLE: Record<string, { label: string; tone: string; rank: number }> = {
  // Assigned by a person, so it outranks anything the system found on its own.
  "action.assignment": { label: "Assigned to you", tone: "red", rank: -1 },
  "biometric.device_offline": { label: "Terminal offline", tone: "red", rank: 0 },
  "biometric.digest": { label: "Biometric", tone: "red", rank: 1 },
  "biometric.mapping": { label: "Wrong person", tone: "red", rank: 2 },
  "employee.data_issues": { label: "Employee data", tone: "amber", rank: 3 },
  "attendance.request": { label: "Approval", tone: "sky", rank: 4 },
  "access_request": { label: "Access request", tone: "sky", rank: 5 },
};

function classify(n: AppNotification) {
  const t = n.type ?? "";
  return ACTIONABLE[t] ?? (t.startsWith("access_request") ? ACTIONABLE["access_request"] : null);
}

const TONE: Record<string, { chip: string; bar: string }> = {
  red: { chip: "bg-red-50 text-red-700 ring-1 ring-red-200", bar: "bg-red-400" },
  amber: { chip: "bg-amber-50 text-amber-700 ring-1 ring-amber-200", bar: "bg-amber-400" },
  sky: { chip: "bg-sky-50 text-sky-700 ring-1 ring-sky-200", bar: "bg-sky-400" },
};

/** Today's date in the app's timezone, so "once a day" matches the working day. */
function manilaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

/** localStorage can throw (private windows, blocked site data) — never let it break the app. */
function seenToday(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function markSeen(key: string) {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    /* ignore — worst case the dialog shows again next navigation */
  }
}

export function ActionRequiredDialog({ userId }: { userId: number | string | undefined }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [dismissed, setDismissed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const { data: notifs } = useQuery({
    queryKey: ["action-required-notifications"],
    queryFn: getNotifications,
    enabled: !!userId,
    staleTime: 60_000,
  });

  const { data: approvals } = useQuery({
    queryKey: ["action-required-approvals"],
    queryFn: async () => (await api.get<{ total: number }>("/api/v1/my/approvals")).data.total ?? 0,
    enabled: !!userId,
    staleTime: 60_000,
  });

  // Unread items that represent work, most consequential first.
  const items = useMemo(() => {
    return (notifs?.data ?? [])
      .filter((n) => !n.read_at && classify(n))
      .sort((a, b) => (classify(a)!.rank - classify(b)!.rank))
      .slice(0, 6);
  }, [notifs]);

  const pendingApprovals = approvals ?? 0;
  const hasWork = items.length > 0 || pendingApprovals > 0;
  const storageKey = userId ? `hris.action-required.${userId}.${manilaToday()}` : "";

  // Read "already shown today" straight from localStorage rather than copying it into
  // state inside an effect, which would trigger a cascading render. The server snapshot
  // is `true` so the dialog never renders during SSR and cannot cause a hydration
  // mismatch — it appears on the client, after mount, once we know who is signed in.
  const seen = useSyncExternalStore(
    useCallback(() => () => {}, []),
    () => (storageKey ? seenToday(storageKey) : true),
    () => true,
  );

  const open = Boolean(userId) && hasWork && !dismissed && !seen;

  // Escape closes, and the close button takes focus so keyboard users are not trapped.
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    markSeen(storageKey);
    setDismissed(true);
  }

  async function openItem(n: AppNotification) {
    close();
    try {
      await markNotificationRead(n.id);
      qc.invalidateQueries({ queryKey: ["nav-unread"] });
    } catch {
      /* navigating matters more than the read receipt */
    }
    if (n.url) router.push(n.url);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-required-title"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-start gap-3 border-b border-slate-100 px-6 py-5">
          <div className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-red-100 text-red-700">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
            </svg>
          </div>
          <div className="min-w-0">
            <h2 id="action-required-title" className="text-lg font-bold text-slate-900">
              Needs your attention
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {pendingApprovals > 0 && (
                <>
                  <strong className="text-slate-700">{pendingApprovals}</strong> request
                  {pendingApprovals === 1 ? "" : "s"} waiting on you
                  {items.length > 0 ? " · " : ". "}
                </>
              )}
              {items.length > 0 && (
                <>
                  <strong className="text-slate-700">{items.length}</strong> issue
                  {items.length === 1 ? "" : "s"} to review.
                </>
              )}
            </p>
          </div>
        </div>

        <ul className="max-h-[46vh] divide-y divide-slate-100 overflow-y-auto">
          {pendingApprovals > 0 && (
            <li>
              <button
                type="button"
                onClick={() => {
                  close();
                  router.push("/my-team");
                }}
                className="flex w-full items-start gap-3 px-6 py-3.5 text-left transition hover:bg-slate-50"
              >
                <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-sky-400" />
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800">Approvals waiting</span>
                    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 ring-1 ring-sky-200">
                      {pendingApprovals}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Overtime, leave and attendance requests are held until you decide.
                  </span>
                </span>
              </button>
            </li>
          )}

          {items.map((n) => {
            const meta = classify(n)!;
            const tone = TONE[meta.tone] ?? TONE.sky;
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => openItem(n)}
                  className="flex w-full items-start gap-3 px-6 py-3.5 text-left transition hover:bg-slate-50"
                >
                  <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${tone.bar}`} />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800">{n.title}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone.chip}`}>
                        {meta.label}
                      </span>
                    </span>
                    <span className="mt-0.5 block line-clamp-2 text-xs text-slate-500">{n.message}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 px-6 py-4">
          <button
            type="button"
            onClick={() => {
              close();
              router.push("/notifications");
            }}
            className="text-sm font-medium text-brand-700 transition hover:text-brand-800 hover:underline"
          >
            View all notifications
          </button>
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
