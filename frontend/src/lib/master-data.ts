import { api, ensureCsrf } from "./api";

// ── Departments ───────────────────────────────────────────────────────────

export type Department = {
  id: number;
  name: string;
  code: string | null;
  is_active: boolean;
  parent_department_id: number | null;
};

export type DepartmentInput = {
  name: string;
  code?: string | null;
};

export const departmentsApi = {
  list: async (): Promise<Department[]> => {
    const { data } = await api.get<{ data: Department[] }>("/api/v1/departments");
    return data.data;
  },
  create: async (body: DepartmentInput): Promise<Department> => {
    await ensureCsrf();
    const { data } = await api.post<{ data: Department }>("/api/v1/departments", body);
    return data.data;
  },
  update: async (id: number, body: DepartmentInput): Promise<Department> => {
    await ensureCsrf();
    const { data } = await api.put<{ data: Department }>(`/api/v1/departments/${id}`, body);
    return data.data;
  },
  destroy: async (id: number): Promise<void> => {
    await ensureCsrf();
    await api.delete(`/api/v1/departments/${id}`);
  },
};

// ── Positions ─────────────────────────────────────────────────────────────

export type Position = {
  id: number;
  title: string;
  department_id: number | null;
  level: number | null;
  is_active: boolean;
};

export type PositionInput = {
  title: string;
  department_id?: number | null;
  level?: number | null;
};

export const positionsApi = {
  list: async (department_id?: number): Promise<Position[]> => {
    const { data } = await api.get<{ data: Position[] }>("/api/v1/positions", {
      params: department_id ? { department_id } : undefined,
    });
    return data.data;
  },
  create: async (body: PositionInput): Promise<Position> => {
    await ensureCsrf();
    const { data } = await api.post<{ data: Position }>("/api/v1/positions", body);
    return data.data;
  },
  update: async (id: number, body: PositionInput): Promise<Position> => {
    await ensureCsrf();
    const { data } = await api.put<{ data: Position }>(`/api/v1/positions/${id}`, body);
    return data.data;
  },
  destroy: async (id: number): Promise<void> => {
    await ensureCsrf();
    await api.delete(`/api/v1/positions/${id}`);
  },
};
