import { Injectable } from '@nestjs/common';
import { Prisma, TeamMember, TelegramLinkToken } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type TeamMemberWithCount = TeamMember & {
  _count: { assignments: number };
  linkToken: TelegramLinkToken | null;
};

export type LinkTokenWithMember = TelegramLinkToken & {
  member: TeamMember;
};

const memberInclude = {
  _count: {
    select: {
      assignments: {
        where: { task: { status: { not: 'TERMINADO' as const } } },
      },
    },
  },
  linkToken: true,
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

  create(data: { name: string }): Promise<TeamMemberWithCount> {
    return this.prisma.teamMember.create({
      data,
      include: memberInclude,
    });
  }

  update(id: number, data: { name?: string }): Promise<TeamMemberWithCount> {
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

  upsertLinkToken(
    memberId: number,
    token: string,
    expiresAt: Date,
  ): Promise<TelegramLinkToken> {
    return this.prisma.telegramLinkToken.upsert({
      where: { memberId },
      create: { memberId, token, expiresAt },
      update: { token, expiresAt, createdAt: new Date() },
    });
  }

  findLinkTokenByToken(token: string): Promise<LinkTokenWithMember | null> {
    return this.prisma.telegramLinkToken.findUnique({
      where: { token },
      include: { member: true },
    });
  }

  async deleteLinkToken(memberId: number): Promise<void> {
    await this.prisma.telegramLinkToken.deleteMany({ where: { memberId } });
  }

  async deleteLinkTokenByToken(token: string): Promise<void> {
    await this.prisma.telegramLinkToken.deleteMany({ where: { token } });
  }

  setTelegramChatId(
    memberId: number,
    chatId: string | null,
  ): Promise<TeamMember> {
    return this.prisma.teamMember.update({
      where: { id: memberId },
      data: { telegramChatId: chatId },
    });
  }

  /** Limpia el chatId de quien lo tenga (re-vinculación a otro miembro). */
  async clearTelegramChatIdByChatId(chatId: string): Promise<void> {
    await this.prisma.teamMember.updateMany({
      where: { telegramChatId: chatId },
      data: { telegramChatId: null },
    });
  }

  /**
   * Canje atómico del token: limpia el chatId de otro miembro si lo tenía,
   * asigna el chatId al miembro del token y borra el token (un solo uso).
   */
  async redeemLinkToken(
    tokenId: number,
    memberId: number,
    chatId: string,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.teamMember.updateMany({
        where: { telegramChatId: chatId, id: { not: memberId } },
        data: { telegramChatId: null },
      }),
      this.prisma.teamMember.update({
        where: { id: memberId },
        data: { telegramChatId: chatId },
      }),
      this.prisma.telegramLinkToken.delete({ where: { id: tokenId } }),
    ]);
  }
}
