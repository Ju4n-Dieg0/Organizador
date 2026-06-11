import { Injectable } from '@nestjs/common';
import {
  Prisma,
  Task,
  TaskEvent,
  TaskEventType,
  TaskLink,
  TaskStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type TaskWithRelations = Task & {
  client: { id: number; name: string };
  links: TaskLink[];
  assignees: {
    memberId: number;
    assignedAt: Date;
    member: { id: number; name: string };
  }[];
};

export type TaskWithEvents = TaskWithRelations & { events: TaskEvent[] };

const taskInclude = {
  client: { select: { id: true, name: true } },
  links: { orderBy: { id: 'asc' as const } },
  assignees: {
    include: { member: { select: { id: true, name: true } } },
    orderBy: { memberId: 'asc' as const },
  },
} satisfies Prisma.TaskInclude;

const taskIncludeWithEvents = {
  ...taskInclude,
  events: { orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.TaskInclude;

export interface TaskFilters {
  status?: TaskStatus;
  clientId?: number;
  memberId?: number;
  search?: string;
}

export interface TaskEventData {
  type: TaskEventType;
  fromStatus?: TaskStatus;
  toStatus?: TaskStatus;
  reason?: string;
  detail?: string;
}

@Injectable()
export class TasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filters: TaskFilters): Promise<TaskWithRelations[]> {
    const where: Prisma.TaskWhereInput = {};
    if (filters.status) where.status = filters.status;
    if (filters.clientId) where.clientId = filters.clientId;
    if (filters.memberId) {
      where.assignees = { some: { memberId: filters.memberId } };
    }
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.task.findMany({
      where,
      include: taskInclude,
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
    });
  }

  findById(id: number): Promise<TaskWithRelations | null> {
    return this.prisma.task.findUnique({ where: { id }, include: taskInclude });
  }

  findByIdWithEvents(id: number): Promise<TaskWithEvents | null> {
    return this.prisma.task.findUnique({
      where: { id },
      include: taskIncludeWithEvents,
    });
  }

  /** Pendientes ASIGNADO/EXTENDIDO con dueDate hasta `until` (recordatorios). */
  findDueUntil(until: Date): Promise<TaskWithRelations[]> {
    return this.prisma.task.findMany({
      where: {
        status: { in: ['ASIGNADO', 'EXTENDIDO'] },
        dueDate: { not: null, lte: until },
      },
      include: taskInclude,
      orderBy: { dueDate: 'asc' },
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

  clientExists(id: number): Promise<{ id: number; name: string } | null> {
    return this.prisma.client.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
  }

  create(data: {
    clientId: number;
    title: string;
    description?: string;
    links?: { url: string; label?: string }[];
  }): Promise<TaskWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          clientId: data.clientId,
          title: data.title,
          description: data.description,
          links: data.links?.length
            ? { create: data.links.map((l) => ({ url: l.url, label: l.label })) }
            : undefined,
        },
      });
      await tx.taskEvent.create({
        data: {
          taskId: task.id,
          type: 'CREACION',
          toStatus: 'PENDIENTE',
          detail: 'Pendiente creado',
        },
      });
      return tx.task.findUniqueOrThrow({
        where: { id: task.id },
        include: taskInclude,
      });
    });
  }

  update(
    id: number,
    data: {
      title?: string;
      description?: string;
      links?: { url: string; label?: string }[];
    },
  ): Promise<TaskWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      if (data.links !== undefined) {
        await tx.taskLink.deleteMany({ where: { taskId: id } });
      }
      return tx.task.update({
        where: { id },
        data: {
          title: data.title,
          description: data.description,
          links:
            data.links !== undefined
              ? {
                  create: data.links.map((l) => ({
                    url: l.url,
                    label: l.label,
                  })),
                }
              : undefined,
        },
        include: taskInclude,
      });
    });
  }

  /** Asigna: estado + dueDate + asignados + evento, todo en una transacción. */
  assign(
    id: number,
    memberIds: number[],
    dueDate: Date,
    event: TaskEventData,
  ): Promise<TaskWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      await tx.taskAssignee.deleteMany({ where: { taskId: id } });
      await tx.taskAssignee.createMany({
        data: memberIds.map((memberId) => ({ taskId: id, memberId })),
      });
      await tx.taskEvent.create({ data: { taskId: id, ...event } });
      return tx.task.update({
        where: { id },
        data: { status: 'ASIGNADO', dueDate },
        include: taskInclude,
      });
    });
  }

  /** Reemplaza asignados (sin cambiar estado) + evento, en una transacción. */
  reassign(
    id: number,
    memberIds: number[],
    event: TaskEventData,
  ): Promise<TaskWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      await tx.taskAssignee.deleteMany({ where: { taskId: id } });
      await tx.taskAssignee.createMany({
        data: memberIds.map((memberId) => ({ taskId: id, memberId })),
      });
      await tx.taskEvent.create({ data: { taskId: id, ...event } });
      return tx.task.findUniqueOrThrow({
        where: { id },
        include: taskInclude,
      });
    });
  }

  /** Cambia estado (y opcionalmente dueDate) + evento, en una transacción. */
  changeStatus(
    id: number,
    status: TaskStatus,
    event: TaskEventData,
    dueDate?: Date,
  ): Promise<TaskWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      await tx.taskEvent.create({ data: { taskId: id, ...event } });
      return tx.task.update({
        where: { id },
        data: { status, ...(dueDate !== undefined ? { dueDate } : {}) },
        include: taskInclude,
      });
    });
  }
}
