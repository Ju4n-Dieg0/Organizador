export class TeamMemberResponseDto {
  id: number;
  name: string;
  telegramChatId: string | null;
  active: boolean;
  activeTaskCount: number;
  createdAt: string;
}
