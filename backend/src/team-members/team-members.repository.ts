import { Injectable } from '@nestjs/common';
import { Prisma, TeamMember } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type TeamMemberWithCount = TeamMember & {
  _count: { assignments: number };
};

const memberInclude = {
  _count: {
    select: {
      assignments: {
        where: { task: { status: { not: 'TERMINADO' as const } } },
      },
    },
  },
} satisfies Prisma.TeamMemberInclude;

@Injectable()
export class TeamMembersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(status: 'active' | 'inactive' | 'all'): Promise<TeamMemberWithCount[]> {
    const where: Prisma.TeamMemberWhereInput = {};
    if (status === 'active') where.active = true;
    if (status === 'inactive') where.active = false;
    return this.prisma.teamMember.findMany({
      where,
      include: memberInclude,
      orderBy: { name: 'asc' },
    });
  }

  findById(id: number): Promise<TeamMemberWithCount | null> {
    return this.prisma.teamMember.findUnique({
      where: { id },
      include: memberInclude,
    });
  }

  findByTelegramChatId(chatId: string): Promise<TeamMember | null> {
    return this.prisma.teamMember.findUnique({
      where: { telegramChatId: chatId },
    });
  }

  create(data: {
    name: string;
    telegramChatId?: string;
  }): Promise<TeamMemberWithCount> {
    return this.prisma.teamMember.create({
      data,
      include: memberInclude,
    });
  }

  update(
    id: number,
    data: { name?: string; telegramChatId?: string | null },
  ): Promise<TeamMemberWithCount> {
    return this.prisma.teamMember.update({
      where: { id },
      data,
      include: memberInclude,
    });
  }

  setActive(id: number, active: boolean): Promise<TeamMemberWithCount> {
    return this.prisma.teamMember.update({
      where: { id },
      data: { active },
      include: memberInclude,
    });
  }
}
