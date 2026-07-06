import { http } from './http';
import { API_PATHS } from '../constants/api';
import type {
  CreateTeamMemberRequest,
  TeamMemberResponse,
  TeamStatusFilter,
  TelegramLinkResponse,
  UpdateTeamMemberRequest,
} from '../types/team.types';

export const teamApi = {
  create: async (data: CreateTeamMemberRequest): Promise<TeamMemberResponse> => {
    const res = await http.post<TeamMemberResponse>(API_PATHS.teamMembers, data);
    return res.data;
  },

  list: async (status?: TeamStatusFilter): Promise<TeamMemberResponse[]> => {
    const res = await http.get<TeamMemberResponse[]>(API_PATHS.teamMembers, {
      params: { status },
    });
    return res.data;
  },

  getById: async (id: number): Promise<TeamMemberResponse> => {
    const res = await http.get<TeamMemberResponse>(`${API_PATHS.teamMembers}/${id}`);
    return res.data;
  },

  update: async (
    id: number,
    data: UpdateTeamMemberRequest,
  ): Promise<TeamMemberResponse> => {
    const res = await http.patch<TeamMemberResponse>(
      `${API_PATHS.teamMembers}/${id}`,
      data,
    );
    return res.data;
  },

  deactivate: async (id: number): Promise<TeamMemberResponse> => {
    const res = await http.patch<TeamMemberResponse>(
      `${API_PATHS.teamMembers}/${id}/deactivate`,
    );
    return res.data;
  },

  activate: async (id: number): Promise<TeamMemberResponse> => {
    const res = await http.patch<TeamMemberResponse>(
      `${API_PATHS.teamMembers}/${id}/activate`,
    );
    return res.data;
  },

  setOwner: async (id: number, isOwner: boolean): Promise<TeamMemberResponse> => {
    const res = await http.patch<TeamMemberResponse>(
      `${API_PATHS.teamMembers}/${id}/owner`,
      { isOwner },
    );
    return res.data;
  },

  generateTelegramLink: async (id: number): Promise<TelegramLinkResponse> => {
    const res = await http.post<TelegramLinkResponse>(
      `${API_PATHS.teamMembers}/${id}/telegram-link`,
    );
    return res.data;
  },

  unlinkTelegram: async (id: number): Promise<void> => {
    await http.delete(`${API_PATHS.teamMembers}/${id}/telegram-link`);
  },
};
