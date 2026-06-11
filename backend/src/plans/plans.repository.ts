import { Injectable } from '@nestjs/common';
import { Plan } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type PlanWithCount = Plan & { _count: { clients: number } };

const includeCount = { _count: { select: { clients: true } } } as const;

@Injectable()
export class PlansRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<PlanWithCount[]> {
    return this.prisma.plan.findMany({
      include: includeCount,
      orderBy: { name: 'asc' },
    });
  }

  findById(id: number): Promise<PlanWithCount | null> {
    return this.prisma.plan.findUnique({
      where: { id },
      include: includeCount,
    });
  }

  findByName(name: string): Promise<Plan | null> {
    return this.prisma.plan.findUnique({ where: { name } });
  }

  create(data: { name: string; description?: string }): Promise<PlanWithCount> {
    return this.prisma.plan.create({ data, include: includeCount });
  }

  update(
    id: number,
    data: { name?: string; description?: string },
  ): Promise<PlanWithCount> {
    return this.prisma.plan.update({
      where: { id },
      data,
      include: includeCount,
    });
  }

  async delete(id: number): Promise<void> {
    await this.prisma.plan.delete({ where: { id } });
  }
}
