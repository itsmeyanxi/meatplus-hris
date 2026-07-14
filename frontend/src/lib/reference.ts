import { api } from "./api";

export type ReferenceCategory = "asset_type" | "visa_type" | "benefit_type" | "work_location";

export type ReferenceItem = {
  id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
};

export type ReferenceInput = {
  name: string;
  description?: string | null;
  is_active?: boolean;
};

const base = (category: ReferenceCategory) => `/api/v1/reference/${category}`;

export const referenceApi = {
  list: async (category: ReferenceCategory): Promise<ReferenceItem[]> => {
    const { data } = await api.get<{ data: ReferenceItem[] }>(base(category));
    return data.data;
  },
  create: async (category: ReferenceCategory, body: ReferenceInput): Promise<ReferenceItem> => {
    const { data } = await api.post<{ data: ReferenceItem }>(base(category), body);
    return data.data;
  },
  update: async (category: ReferenceCategory, id: number, body: ReferenceInput): Promise<ReferenceItem> => {
    const { data } = await api.put<{ data: ReferenceItem }>(`${base(category)}/${id}`, body);
    return data.data;
  },
  destroy: (category: ReferenceCategory, id: number) => api.delete(`${base(category)}/${id}`),
};
