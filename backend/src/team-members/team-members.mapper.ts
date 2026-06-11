import { TeamMemberResponseDto } from './dto/team-member-response.dto';
import { TeamMemberWithCount } from './team-members.repository';

export class TeamMembersMapper {
  static toResponse(member: TeamMemberWithCount): TeamMemberResponseDto {
    return {
      id: member.id,
      name: member.name,
      telegramChatId: member.telegramChatId,
      active: member.active,
      activeTaskCount: member._count.assignments,
      createdAt: member.createdAt.toISOString(),
    };
  }
}
