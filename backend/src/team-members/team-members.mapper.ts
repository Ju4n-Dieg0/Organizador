import { TeamMemberResponseDto } from './dto/team-member-response.dto';
import { TeamMemberWithCount } from './team-members.repository';

export class TeamMembersMapper {
  static toResponse(member: TeamMemberWithCount): TeamMemberResponseDto {
    const pending =
      !!member.linkToken && member.linkToken.expiresAt > new Date();
    return {
      id: member.id,
      name: member.name,
      active: member.active,
      activeTaskCount: member._count.assignments,
      isOwner: member.isOwner,
      telegramLinked: !!member.telegramChatId,
      telegramLinkPending: pending,
      telegramLinkExpiresAt: pending
        ? member.linkToken!.expiresAt.toISOString()
        : null,
      createdAt: member.createdAt.toISOString(),
    };
  }
}
