export interface TeamMemberResponse {
  id: number;
  name: string;
  active: boolean;
  activeTaskCount: number;
  /** Tiene chat de Telegram vinculado (el chatId crudo nunca se expone). */
  telegramLinked: boolean;
  /** Hay un enlace de vinculación generado vigente sin usar. */
  telegramLinkPending: boolean;
  /** Expiración ISO del enlace vigente; solo si telegramLinkPending. */
  telegramLinkExpiresAt: string | null;
  createdAt: string;
}

export interface TelegramLinkResponse {
  link: string;
  expiresAt: string;
}

export interface CreateTeamMemberRequest {
  name: string;
}

export interface UpdateTeamMemberRequest {
  name?: string;
}

export type TeamStatusFilter = 'active' | 'inactive' | 'all';
