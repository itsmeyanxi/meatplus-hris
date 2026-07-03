import { api, ensureCsrf } from "./api";

export const invitationsApi = {
  send: async (employeeId: number, email?: string) => {
    const { data } = await api.post(`/api/v1/employees/${employeeId}/invite`, email ? { email } : {});
    return data as { message: string; expires_at: string };
  },

  bulkSend: async (employeeIds: number[]) => {
    const { data } = await api.post(`/api/v1/employees/bulk-invite`, { employee_ids: employeeIds });
    return data as { sent: number; skipped: number; errors: string[] };
  },

  show: async (token: string) => {
    const { data } = await api.get(`/api/v1/invite/${token}`);
    return data as { email: string; name: string; expires_at: string };
  },

  accept: async (token: string, payload: { username: string; password: string; password_confirmation: string }) => {
    await ensureCsrf();
    const { data } = await api.post(`/api/v1/invite/${token}/accept`, payload);
    return data as { message: string };
  },
};
