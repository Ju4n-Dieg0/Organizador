export interface TeamMemberResponse {
  id: number;
  name: string;
  telegramChatId: string | null;
  active: boolean;
  activeTaskCount: number;
  createdAt: string;
}

export interface CreateTeamMemberRequest {
  name: string;
  telegramChatId?: string;
}

export interface UpdateTeamMemberRequest {
  name?: string;
  telegramChatId?: string | null;
}

export type TeamStatusFilter = 'active' | 'inactive' | 'all';
