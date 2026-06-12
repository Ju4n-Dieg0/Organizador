import { Injectable } from '@nestjs/common';
import {
  Prisma,
  RequestStatus,
  RequestType,
  TaskStatus,
  TeamRequest,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type TeamRequestWithRelations = TeamRequest & {
  requester: { id: number; name: string };
  task: {
    id: number;
    title: string;
    status: TaskStatus;
    client: { name: string };
  } | null;
};

const requestInclude = {
  requester: { select: { id: true, name: true } },
  task: {
    select: {
      id: true,
      title: true,
      status: true,
      client: { select: { name: true } },
    },
  },
} satisfies Prisma.TeamRequestInclude;

@Injectable()
export class RequestsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(status?: RequestStatus): Promise<TeamRequestWithRelations[]> {
    return this.prisma.teamRequest.findMany({
      where: status ? { status } : undefined,
      include: requestInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(id: number): Promise<TeamRequestWithRelations | null> {
    return this.prisma.teamRequest.findUnique({
      where: { id },
      include: requestInclude,
    });
  }

  create(data: {
    type: RequestType;
    requesterId: number;
    taskId: number | null;
    payload: Prisma.InputJsonValue;
  }): Promise<TeamRequestWithRelations> {
    return this.prisma.teamRequest.create({
      data: {
        type: data.type,
        requesterId: data.requesterId,
        taskId: data.taskId,
        payload: data.payload,
      },
      include: requestInclude,
    });
  }

  resolve(
    id: number,
    data: {
      status: RequestStatus;
      resolvedBy: string;
      resolvedAt: Date;
      rejectionReason?: string;
    },
  ): Promise<TeamRequestWithRelations> {
    return this.prisma.teamRequest.update({
      where: { id },
      data: {
        status: data.status,
        resolvedBy: data.resolvedBy,
        resolvedAt: data.resolvedAt,
        rejectionReason: data.rejectionReason,
      },
      include: requestInclude,
    });
  }

  // --- Lecturas auxiliares para validar el payload al crear ---

  findClientById(
    id: number,
  ): Promise<{ id: number; name: string; active: boolean } | null> {
    return this.prisma.client.findUnique({
      where: { id },
      select: { id: true, name: true, active: true },
    });
  }

  findMembersByIds(
    ids: number[],
  ): Promise<{ id: number; name: string; active: boolean }[]> {
    return this.prisma.teamMember.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, active: true },
    });
  }

  findMemberById(
    id: number,
  ): Promise<{ id: number; name: string; active: boolean } | null> {
    return this.prisma.teamMember.findUnique({
      where: { id },
      select: { id: true, name: true, active: true },
    });
  }

  findTaskById(id: number): Promise<{ id: number; title: string } | null> {
    return this.prisma.task.findUnique({
      where: { id },
      select: { id: true, title: true },
    });
  }
}
