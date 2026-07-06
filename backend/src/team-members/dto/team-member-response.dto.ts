export class TeamMemberResponseDto {
  id: number;
  name: string;
  active: boolean;
  activeTaskCount: number;
  /** Este miembro es el dueño (máximo uno en true). */
  isOwner: boolean;
  /** Tiene telegramChatId guardado (el chatId crudo NUNCA se expone). */
  telegramLinked: boolean;
  /** Hay un token de vinculación vigente sin usar. */
  telegramLinkPending: boolean;
  /** Expiración del token vigente (solo si telegramLinkPending). */
  telegramLinkExpiresAt: string | null;
  createdAt: string;
}
