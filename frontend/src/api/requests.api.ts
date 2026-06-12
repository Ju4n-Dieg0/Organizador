import { http } from './http';
import { API_PATHS } from '../constants/api';
import type {
  RejectRequestRequest,
  RequestStatusFilter,
  TeamRequestResponse,
} from '../types/request.types';

export const requestsApi = {
  list: async (
    status: RequestStatusFilter = 'all',
  ): Promise<TeamRequestResponse[]> => {
    const res = await http.get<TeamRequestResponse[]>(API_PATHS.requests, {
      params: { status },
    });
    return res.data;
  },

  getById: async (id: number): Promise<TeamRequestResponse> => {
    const res = await http.get<TeamRequestResponse>(
      `${API_PATHS.requests}/${id}`,
    );
    return res.data;
  },

  approve: async (id: number): Promise<TeamRequestResponse> => {
    const res = await http.post<TeamRequestResponse>(
      `${API_PATHS.requests}/${id}/approve`,
    );
    return res.data;
  },

  reject: async (
    id: number,
    data: RejectRequestRequest,
  ): Promise<TeamRequestResponse> => {
    const res = await http.post<TeamRequestResponse>(
      `${API_PATHS.requests}/${id}/reject`,
      data,
    );
    return res.data;
  },
};
