import { api } from "./api";

export type AppNotification = {
  id: string;
  type: string | null;
  title: string;
  message: string;
  url: string | null;
  read_at: string | null;
  created_at: string;
};

export async function getNotifications(): Promise<{ data: AppNotification[]; unread: number }> {
  const { data } = await api.get<{ data: AppNotification[]; unread: number }>(
    "/api/v1/my/notifications",
  );
  return data;
}

export const markNotificationRead = (id: string) =>
  api.post(`/api/v1/my/notifications/${id}/read`);

export const markAllNotificationsRead = () =>
  api.post("/api/v1/my/notifications/read-all");
