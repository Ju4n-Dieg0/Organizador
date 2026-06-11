import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { AssignTaskDto } from './dto/assign-task.dto';
import { ChangeStatusDto } from './dto/change-status.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { ExtendTaskDto } from './dto/extend-task.dto';
import { QueryTasksDto } from './dto/query-tasks.dto';
import { ReassignTaskDto } from './dto/reassign-task.dto';
import {
  TaskDetailResponseDto,
  TaskResponseDto,
  TaskStatus,
} from './dto/task-response.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TasksMapper } from './tasks.mapper';
import { TasksRepository, TaskWithRelations } from './tasks.repository';

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  PENDIENTE: ['ASIGNADO'],
  ASIGNADO: ['EXTENDIDO', 'TERMINADO'],
  EXTENDIDO: ['EXTENDIDO', 'TERMINADO'],
  TERMINADO: [],
};

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly tasksRepository: TasksRepository,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(dto: CreateTaskDto): Promise<TaskResponseDto> {
    const client = await this.tasksRepository.clientExists(dto.clientId);
    if (!client) {
      throw new NotFoundException(`Cliente #${dto.clientId} no encontrado`);
    }
    const task = await this.tasksRepository.create({
      clientId: dto.clientId,
      title: dto.title,
      description: dto.description,
      links: dto.links,
    });
    const response = TasksMapper.toResponse(task);
    this.fireNotification(() =>
      this.notificationsService.notifyTaskCreated(response),
    );
    return response;
  }

  async findAll(query: QueryTasksDto): Promise<TaskResponseDto[]> {
    const tasks = await this.tasksRepository.findAll({
      status: query.status,
      clientId: query.clientId,
      memberId: query.memberId,
      search: query.search,
    });
    return tasks.map((t) => TasksMapper.toResponse(t));
  }

  async findOne(id: number): Promise<TaskDetailResponseDto> {
    const task = await this.tasksRepository.findByIdWithEvents(id);
    if (!task) {
      throw new NotFoundException(`Pendiente #${id} no encontrado`);
    }
    return TasksMapper.toDetailResponse(task);
  }

  async update(id: number, dto: UpdateTaskDto): Promise<TaskResponseDto> {
    await this.getTaskOrFail(id);
    const task = await this.tasksRepository.update(id, {
      title: dto.title,
      description: dto.description,
      links: dto.links,
    });
    return TasksMapper.toResponse(task);
  }

  async assign(id: number, dto: AssignTaskDto): Promise<TaskResponseDto> {
    const task = await this.getTaskOrFail(id);
    if (task.status !== 'PENDIENTE') {
      throw new ConflictException(
        `Transición inválida: no se puede asignar un pendiente en estado ${task.status}. Solo se puede asignar un pendiente en estado PENDIENTE (usa reasignar para cambiar las personas).`,
      );
    }
    const members = await this.resolveMembers(dto.memberIds);
    const memberNames = members.map((m) => m.name).join(', ');

    const updated = await this.tasksRepository.assign(
      id,
      dto.memberIds,
      new Date(dto.dueDate),
      {
        type: 'ASIGNACION',
        fromStatus: 'PENDIENTE',
        toStatus: 'ASIGNADO',
        detail: `Asignado a ${memberNames}`,
      },
    );
    const response = TasksMapper.toResponse(updated);
    this.fireNotification(() =>
      this.notificationsService.notifyTaskAssigned(response),
    );
    return response;
  }

  async reassign(id: number, dto: ReassignTaskDto): Promise<TaskResponseDto> {
    const task = await this.getTaskOrFail(id);
    if (task.status !== 'ASIGNADO' && task.status !== 'EXTENDIDO') {
      throw new ConflictException(
        `Transición inválida: no se puede reasignar un pendiente en estado ${task.status}. Solo se puede reasignar en estado ASIGNADO o EXTENDIDO.`,
      );
    }
    const members = await this.resolveMembers(dto.memberIds);
    const oldNames =
      task.assignees.map((a) => a.member.name).join(', ') || 'nadie';
    const newNames = members.map((m) => m.name).join(', ');
    const detail = `de ${oldNames} a ${newNames}`;

    const updated = await this.tasksRepository.reassign(id, dto.memberIds, {
      type: 'REASIGNACION',
      reason: dto.reason,
      detail,
    });
    const response = TasksMapper.toResponse(updated);
    this.fireNotification(() =>
      this.notificationsService.notifyTaskReassigned(
        response,
        detail,
        dto.reason,
      ),
    );
    return response;
  }

  async extend(id: number, dto: ExtendTaskDto): Promise<TaskResponseDto> {
    const task = await this.getTaskOrFail(id);
    if (task.status !== 'ASIGNADO' && task.status !== 'EXTENDIDO') {
      throw new ConflictException(
        `Transición inválida: no se puede extender un pendiente en estado ${task.status}. Solo se puede extender en estado ASIGNADO o EXTENDIDO.`,
      );
    }
    const updated = await this.tasksRepository.changeStatus(
      id,
      'EXTENDIDO',
      {
        type: 'EXTENSION',
        fromStatus: task.status,
        toStatus: 'EXTENDIDO',
        reason: dto.reason,
        detail: `Nueva fecha de entrega: ${dto.newDueDate.slice(0, 10)}`,
      },
      new Date(dto.newDueDate),
    );
    const response = TasksMapper.toResponse(updated);
    this.fireNotification(() =>
      this.notificationsService.notifyTaskExtended(response, dto.reason),
    );
    return response;
  }

  async complete(id: number): Promise<TaskResponseDto> {
    const task = await this.getTaskOrFail(id);
    if (task.status !== 'ASIGNADO' && task.status !== 'EXTENDIDO') {
      throw new ConflictException(
        `Transición inválida: no se puede terminar un pendiente en estado ${task.status}. Solo se puede terminar en estado ASIGNADO o EXTENDIDO.`,
      );
    }
    const updated = await this.tasksRepository.changeStatus(id, 'TERMINADO', {
      type: 'CAMBIO_ESTADO',
      fromStatus: task.status,
      toStatus: 'TERMINADO',
      detail: 'Pendiente terminado',
    });
    const response = TasksMapper.toResponse(updated);
    this.fireNotification(() =>
      this.notificationsService.notifyTaskCompleted(response),
    );
    return response;
  }

  async changeStatus(
    id: number,
    dto: ChangeStatusDto,
  ): Promise<TaskResponseDto> {
    const task = await this.getTaskOrFail(id);
    const from = task.status as TaskStatus;
    const to = dto.status;

    if (!VALID_TRANSITIONS[from].includes(to)) {
      throw new ConflictException(
        `Transición inválida de ${from} a ${to}`,
      );
    }
    if (to === 'EXTENDIDO' && !dto.reason) {
      throw new BadRequestException(
        'Se requiere una razón para pasar a EXTENDIDO',
      );
    }
    if (to === 'ASIGNADO') {
      if (task.assignees.length === 0 || !task.dueDate) {
        throw new ConflictException(
          'Para pasar a ASIGNADO usa la acción de asignación (requiere al menos una persona y una fecha de entrega)',
        );
      }
    }
    if (to === 'TERMINADO') {
      return this.complete(id);
    }

    const updated = await this.tasksRepository.changeStatus(id, to, {
      type: 'CAMBIO_ESTADO',
      fromStatus: from,
      toStatus: to,
      reason: dto.reason,
    });
    const response = TasksMapper.toResponse(updated);
    if (to === 'EXTENDIDO') {
      this.fireNotification(() =>
        this.notificationsService.notifyTaskExtended(
          response,
          dto.reason ?? '',
        ),
      );
    }
    return response;
  }

  /** Pendientes ASIGNADO/EXTENDIDO con dueDate vencida, de hoy o de mañana. */
  async findForReminders(): Promise<TaskResponseDto[]> {
    const endOfTomorrow = new Date();
    endOfTomorrow.setDate(endOfTomorrow.getDate() + 1);
    endOfTomorrow.setHours(23, 59, 59, 999);
    const tasks = await this.tasksRepository.findDueUntil(endOfTomorrow);
    return tasks.map((t) => TasksMapper.toResponse(t));
  }

  private async getTaskOrFail(id: number): Promise<TaskWithRelations> {
    const task = await this.tasksRepository.findById(id);
    if (!task) {
      throw new NotFoundException(`Pendiente #${id} no encontrado`);
    }
    return task;
  }

  private async resolveMembers(
    memberIds: number[],
  ): Promise<{ id: number; name: string }[]> {
    const unique = [...new Set(memberIds)];
    const members = await this.tasksRepository.findMembersByIds(unique);
    if (members.length !== unique.length) {
      const found = new Set(members.map((m) => m.id));
      const missing = unique.filter((id) => !found.has(id));
      throw new NotFoundException(
        `Persona(s) no encontrada(s): ${missing.map((id) => `#${id}`).join(', ')}`,
      );
    }
    return members;
  }

  private fireNotification(fn: () => Promise<void>): void {
    fn().catch((err: unknown) => {
      this.logger.error(
        `Error enviando notificación de Telegram: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }
}
