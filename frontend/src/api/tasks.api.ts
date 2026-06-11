import { http } from './http';
import { API_PATHS } from '../constants/api';
import type {
  AssignTaskRequest,
  ChangeTaskStatusRequest,
  CreateTaskRequest,
  ExtendTaskRequest,
  ReassignTaskRequest,
  TaskDetailResponse,
  TaskResponse,
  TasksQuery,
  UpdateTaskRequest,
} from '../types/task.types';

export const tasksApi = {
  create: async (data: CreateTaskRequest): Promise<TaskResponse> => {
    const res = await http.post<TaskResponse>(API_PATHS.tasks, data);
    return res.data;
  },

  list: async (query: TasksQuery = {}): Promise<TaskResponse[]> => {
    const res = await http.get<TaskResponse[]>(API_PATHS.tasks, {
      params: {
        status: query.status,
        clientId: query.clientId,
        memberId: query.memberId,
        search: query.search || undefined,
      },
    });
    return res.data;
  },

  getById: async (id: number): Promise<TaskDetailResponse> => {
    const res = await http.get<TaskDetailResponse>(`${API_PATHS.tasks}/${id}`);
    return res.data;
  },

  update: async (id: number, data: UpdateTaskRequest): Promise<TaskResponse> => {
    const res = await http.patch<TaskResponse>(`${API_PATHS.tasks}/${id}`, data);
    return res.data;
  },

  assign: async (id: number, data: AssignTaskRequest): Promise<TaskResponse> => {
    const res = await http.post<TaskResponse>(`${API_PATHS.tasks}/${id}/assign`, data);
    return res.data;
  },

  reassign: async (id: number, data: ReassignTaskRequest): Promise<TaskResponse> => {
    const res = await http.post<TaskResponse>(`${API_PATHS.tasks}/${id}/reassign`, data);
    return res.data;
  },

  extend: async (id: number, data: ExtendTaskRequest): Promise<TaskResponse> => {
    const res = await http.post<TaskResponse>(`${API_PATHS.tasks}/${id}/extend`, data);
    return res.data;
  },

  complete: async (id: number): Promise<TaskResponse> => {
    const res = await http.post<TaskResponse>(`${API_PATHS.tasks}/${id}/complete`);
    return res.data;
  },

  changeStatus: async (
    id: number,
    data: ChangeTaskStatusRequest,
  ): Promise<TaskResponse> => {
    const res = await http.post<TaskResponse>(`${API_PATHS.tasks}/${id}/status`, data);
    return res.data;
  },
};
