import { Injectable } from '@nestjs/common';
import { Client, ClientDriveLink, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type ClientWithRelations = Client & {
  plan: { id: number; name: string } | null;
  driveLinks: ClientDriveLink[];
  _count: { tasks: number };
};

const clientInclude = {
  plan: { select: { id: true, name: true } },
  driveLinks: { orderBy: { id: 'asc' as const } },
  _count: {
    select: { tasks: { where: { status: { not: 'TERMINADO' as const } } } },
  },
} satisfies Prisma.ClientInclude;

export interface ClientFilters {
  status: 'active' | 'inactive' | 'all';
  search?: string;
}

@Injectable()
export class ClientsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filters: ClientFilters): Promise<ClientWithRelations[]> {
    const where: Prisma.ClientWhereInput = {};
    if (filters.status === 'active') where.active = true;
    if (filters.status === 'inactive') where.active = false;
    if (filters.search) {
      where.name = { contains: filters.search, mode: 'insensitive' };
    }
    return this.prisma.client.findMany({
      where,
      include: clientInclude,
      orderBy: { name: 'asc' },
    });
  }

  findById(id: number): Promise<ClientWithRelations | null> {
    return this.prisma.client.findUnique({
      where: { id },
      include: clientInclude,
    });
  }

  create(data: {
    name: string;
    planId?: number;
    driveLinks?: { url: string; label?: string }[];
  }): Promise<ClientWithRelations> {
    return this.prisma.client.create({
      data: {
        name: data.name,
        planId: data.planId,
        driveLinks: data.driveLinks?.length
          ? {
              create: data.driveLinks.map((l) => ({
                url: l.url,
                label: l.label,
              })),
            }
          : undefined,
      },
      include: clientInclude,
    });
  }

  async update(
    id: number,
    data: {
      name?: string;
      planId?: number | null;
      driveLinks?: { url: string; label?: string }[];
    },
  ): Promise<ClientWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      if (data.driveLinks !== undefined) {
        await tx.clientDriveLink.deleteMany({ where: { clientId: id } });
      }
      return tx.client.update({
        where: { id },
        data: {
          name: data.name,
          planId: data.planId,
          driveLinks:
            data.driveLinks !== undefined
              ? {
                  create: data.driveLinks.map((l) => ({
                    url: l.url,
                    label: l.label,
                  })),
                }
              : undefined,
        },
        include: clientInclude,
      });
    });
  }

  setActive(id: number, active: boolean): Promise<ClientWithRelations> {
    return this.prisma.client.update({
      where: { id },
      data: { active },
      include: clientInclude,
    });
  }
}
