"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { getNotifications, markAllNotificationsRead, markNotificationRead, type AppNotification } from "@/lib/notifications";
import { PageHeader } from "@/components/ui";

function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: getNotifications,
    refetchInterval: 60_000,
  });

  const items = data?.data ?? [];
  const unread = data?.unread ?? 0;

  const readOne = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const readAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return (
    <div className="space-y-4 max-w-2xl">
      <PageHeader
        title="Notifications"
        actions={
          unread > 0 ? (
            <button
              onClick={() => readAll.mutate()}
              disabled={readAll.isPending}
              className="text-sm text-slate-500 hover:text-slate-900 underline"
            >
              Mark all as read
            </button>
          ) : undefined
        }
      />

      <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
        {isLoading && (
          <div className="px-5 py-10 text-center text-sm text-slate-400">Loading…</div>
        )}

        {!isLoading && items.length === 0 && (
          <div className="px-5 py-16 text-center">
            <p className="text-2xl">🎉</p>
            <p className="mt-2 text-sm text-slate-500">You&apos;re all caught up!</p>
          </div>
        )}

        {items.map((n) => (
          <NotificationRow
            key={n.id}
            notification={n}
            onRead={() => readOne.mutate(n.id)}
          />
        ))}
      </div>
    </div>
  );
}

function NotificationRow({ notification: n, onRead }: { notification: AppNotification; onRead: () => void }) {
  const content = (
    <div className={`flex items-start gap-3 px-5 py-4 transition hover:bg-slate-50 ${!n.read_at ? "bg-sky-50/50" : ""}`}>
      <div className="mt-1.5 shrink-0">
        {!n.read_at ? (
          <span className="flex h-2 w-2 rounded-full bg-sky-500" />
        ) : (
          <span className="flex h-2 w-2 rounded-full bg-slate-200" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${!n.read_at ? "font-semibold text-slate-900" : "font-medium text-slate-700"}`}>
          {n.title}
        </p>
        {n.message && <p className="mt-0.5 text-xs text-slate-500">{n.message}</p>}
        <p className="mt-1 text-xs text-slate-400">{timeAgo(n.created_at)}</p>
      </div>
      {!n.read_at && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRead(); }}
          className="shrink-0 text-xs text-slate-400 hover:text-slate-700"
          title="Mark as read"
        >
          ✓
        </button>
      )}
    </div>
  );

  if (n.url) {
    return (
      <Link href={n.url} onClick={onRead} className="block">
        {content}
      </Link>
    );
  }

  return <div>{content}</div>;
}
