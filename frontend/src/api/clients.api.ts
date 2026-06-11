import { http } from './http';
import { API_PATHS } from '../constants/api';
import type {
  ClientResponse,
  ClientsQuery,
  CreateClientRequest,
  UpdateClientRequest,
} from '../types/client.types';

export const clientsApi = {
  create: async (data: CreateClientRequest): Promise<ClientResponse> => {
    const res = await http.post<ClientResponse>(API_PATHS.clients, data);
    return res.data;
  },

  list: async (query: ClientsQuery = {}): Promise<ClientResponse[]> => {
    const res = await http.get<ClientResponse[]>(API_PATHS.clients, {
      params: {
        status: query.status,
        search: query.search || undefined,
      },
    });
    return res.data;
  },

  getById: async (id: number): Promise<ClientResponse> => {
    const res = await http.get<ClientResponse>(`${API_PATHS.clients}/${id}`);
    return res.data;
  },

  update: async (id: number, data: UpdateClientRequest): Promise<ClientResponse> => {
    const res = await http.patch<ClientResponse>(`${API_PATHS.clients}/${id}`, data);
    return res.data;
  },

  deactivate: async (id: number): Promise<ClientResponse> => {
    const res = await http.patch<ClientResponse>(`${API_PATHS.clients}/${id}/deactivate`);
    return res.data;
  },

  activate: async (id: number): Promise<ClientResponse> => {
    const res = await http.patch<ClientResponse>(`${API_PATHS.clients}/${id}/activate`);
    return res.data;
  },
};
