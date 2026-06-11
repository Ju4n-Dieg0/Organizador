import { http } from './http';
import { API_PATHS } from '../constants/api';
import type {
  CreatePlanRequest,
  PlanResponse,
  UpdatePlanRequest,
} from '../types/plan.types';

export const plansApi = {
  create: async (data: CreatePlanRequest): Promise<PlanResponse> => {
    const res = await http.post<PlanResponse>(API_PATHS.plans, data);
    return res.data;
  },

  list: async (): Promise<PlanResponse[]> => {
    const res = await http.get<PlanResponse[]>(API_PATHS.plans);
    return res.data;
  },

  getById: async (id: number): Promise<PlanResponse> => {
    const res = await http.get<PlanResponse>(`${API_PATHS.plans}/${id}`);
    return res.data;
  },

  update: async (id: number, data: UpdatePlanRequest): Promise<PlanResponse> => {
    const res = await http.patch<PlanResponse>(`${API_PATHS.plans}/${id}`, data);
    return res.data;
  },

  remove: async (id: number): Promise<void> => {
    await http.delete(`${API_PATHS.plans}/${id}`);
  },
};
