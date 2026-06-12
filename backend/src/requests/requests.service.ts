import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import {
  TASK_STATUSES,
  TaskStatus,
} from '../tasks/dto/task-response.dto';
import { TasksService } from '../tasks/tasks.service';
import { QueryRequestsDto } from './dto/query-requests.dto';
import {
  TeamRequestPayload,
  TeamRequestResponseDto,
} from './dto/team-request-response.dto';
import { RequestsMapper } from './requests.mapper';
import {
  RequestsRepository,
  TeamRequestWithRelations,
} from './requests.repository';

/**
 * Entrada interna para crear una solicitud (la usa la capa de Telegram;
 * no existe endpoint REST de creación). El service valida campo a campo
 * y enriquece el payload con los nombres autoritativos de la base.
 */
export type CreateTeamRequestInput =
  | {
      type: 'CREAR_PENDIENTE';
      requesterId: number;
      taskId?: null;
      payload: {
        clientId: number;
        title: string;
        memberIds?: number[];
        dueDate?: string | null;
      };
    }
  | {
      type: 'EXTENSION';
      requesterId: number;
      taskId: number;
      payload: { newDueDate: string; reason: string };
    }
  | {
      type: 'REASIGNACION';
      requesterId: number;
      taskId: number;
      payload: { memberIds: number[]; reason: string };
    }
  | {
      type: 'CAMBIO_ESTADO';
      requesterId: number;
      taskId: number;
      payload: { status: TaskStatus; reason?: string | null };
    };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class RequestsService {
  private readonly logger = new Logger(RequestsService.name);

  constructor(
    private readonly requestsRepository: RequestsRepository,
    private readonly tasksService: TasksService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findAll(query: QueryRequestsDto): Promise<TeamRequestResponseDto[]> {
    const status =
      !query.status || query.status === 'all' ? undefined : query.status;
    const requests = await this.requestsRepository.findAll(status);
    return requests.map((r) => RequestsMapper.toResponse(r));
  }

  async findOne(id: number): Promise<TeamRequestResponseDto> {
    const request = await this.getRequestOrFail(id);
    return RequestsMapper.toResponse(request);
  }

  /**
   * Crea una solicitud del equipo (uso interno: la invoca la capa de Telegram).
   * Valida el payload campo a campo contra el tipo antes de persistir y
   * notifica al dueño con el resumen + botones Aceptar/Rechazar.
   */
  async create(input: CreateTeamRequestInput): Promise<TeamRequestResponseDto> {
    const requester = await this.requestsRepository.findMemberById(
      input.requesterId,
    );
    if (!requester) {
      throw new NotFoundException(
        `Persona #${input.requesterId} no encontrada`,
      );
    }
    if (!requester.active) {
      throw new ConflictException(
        `La persona "${requester.name}" está inactiva y no puede crear solicitudes`,
      );
    }

    const taskId = await this.validateTaskId(input);
    const payload = await this.validateAndBuildPayload(input);

    const created = await this.requestsRepository.create({
      type: input.type,
      requesterId: input.requesterId,
      taskId,
      payload,
    });
    const response = RequestsMapper.toResponse(created);
    this.fireNotification(() =>
      this.notificationsService.notifyRequestCreated(response),
    );
    return response;
  }

  /**
   * Aprueba la solicitud ejecutando la operación real vía TasksService
   * (mismos TaskEvent y validaciones de transición). Si la operación falla,
   * la solicitud queda PENDIENTE y se propaga el error.
   */
  async approve(
    id: number,
    resolvedBy: string,
  ): Promise<TeamRequestResponseDto> {
    const request = await this.getRequestOrFail(id);
    this.ensurePending(request);

    await this.executeApprovedOperation(request);

    const resolved = await this.requestsRepository.resolve(id, {
      status: 'APROBADA',
      resolvedBy,
      resolvedAt: new Date(),
    });
    const response = RequestsMapper.toResponse(resolved);
    this.fireNotification(() =>
      this.notificationsService.notifyRequestResolved(response),
    );
    return response;
  }

  /** Rechaza la solicitud (razón obligatoria) y notifica al solicitante. */
  async reject(
    id: number,
    reason: string,
    resolvedBy: string,
  ): Promise<TeamRequestResponseDto> {
    if (!reason || !reason.trim()) {
      throw new BadRequestException('La razón es obligatoria para rechazar');
    }
    const request = await this.getRequestOrFail(id);
    this.ensurePending(request);

    const resolved = await this.requestsRepository.resolve(id, {
      status: 'RECHAZADA',
      resolvedBy,
      resolvedAt: new Date(),
      rejectionReason: reason.trim(),
    });
    const response = RequestsMapper.toResponse(resolved);
    this.fireNotification(() =>
      this.notificationsService.notifyRequestResolved(response),
    );
    return response;
  }

  // --- Aprobación: ejecución de la operación real ---

  private async executeApprovedOperation(
    request: TeamRequestWithRelations,
  ): Promise<void> {
    const payload = request.payload as unknown as TeamRequestPayload;

    if (payload.kind === 'CREAR_PENDIENTE') {
      const task = await this.tasksService.create({
        clientId: payload.clientId,
        title: payload.title,
      });
      if (payload.memberIds.length > 0 && payload.dueDate) {
        await this.tasksService.assign(task.id, {
          memberIds: payload.memberIds,
          dueDate: payload.dueDate,
        });
      }
      return;
    }

    if (!request.taskId) {
      throw new ConflictException(
        'El pendiente de esta solicitud ya no existe: no se puede aprobar',
      );
    }

    switch (payload.kind) {
      case 'EXTENSION':
        await this.tasksService.extend(request.taskId, {
          newDueDate: payload.newDueDate,
          reason: payload.reason,
        });
        return;
      case 'REASIGNACION':
        await this.tasksService.reassign(request.taskId, {
          memberIds: payload.memberIds,
          reason: payload.reason,
        });
        return;
      case 'CAMBIO_ESTADO':
        await this.tasksService.changeStatus(request.taskId, {
          status: payload.status,
          reason: payload.reason ?? undefined,
        });
        return;
    }
  }

  // --- Validación del payload al crear ---

  private async validateTaskId(
    input: CreateTeamRequestInput,
  ): Promise<number | null> {
    if (input.type === 'CREAR_PENDIENTE') {
      if (input.taskId != null) {
        throw new BadRequestException(
          'Una solicitud de nuevo pendiente no puede referenciar un pendiente existente',
        );
      }
      return null;
    }
    if (!input.taskId) {
      throw new BadRequestException(
        'Esta solicitud requiere el pendiente sobre el que se aplica',
      );
    }
    const task = await this.requestsRepository.findTaskById(input.taskId);
    if (!task) {
      throw new NotFoundException(`Pendiente #${input.taskId} no encontrado`);
    }
    return input.taskId;
  }

  private async validateAndBuildPayload(
    input: CreateTeamRequestInput,
  ): Promise<TeamRequestPayload> {
    switch (input.type) {
      case 'CREAR_PENDIENTE': {
        const { clientId, title, memberIds = [], dueDate = null } =
          input.payload;
        if (typeof title !== 'string' || !title.trim()) {
          throw new BadRequestException('El título es obligatorio');
        }
        if (!Number.isInteger(clientId)) {
          throw new BadRequestException(
            'clientId debe ser un número entero',
          );
        }
        const client = await this.requestsRepository.findClientById(clientId);
        if (!client) {
          throw new NotFoundException(`Cliente #${clientId} no encontrado`);
        }
        if (!client.active) {
          throw new ConflictException(
            `El cliente "${client.name}" está inactivo`,
          );
        }
        const members = await this.resolveActiveMembers(memberIds);
        if (dueDate !== null) {
          this.validateDate(dueDate, 'La fecha de entrega');
        }
        if (members.length === 0 && dueDate !== null) {
          throw new BadRequestException(
            'Para proponer una fecha de entrega debes proponer al menos una persona asignada',
          );
        }
        return {
          kind: 'CREAR_PENDIENTE',
          clientId: client.id,
          clientName: client.name,
          title: title.trim(),
          memberIds: members.map((m) => m.id),
          memberNames: members.map((m) => m.name),
          dueDate,
        };
      }
      case 'EXTENSION': {
        const { newDueDate, reason } = input.payload;
        this.validateDate(newDueDate, 'La nueva fecha de entrega');
        this.validateReason(reason, 'extender');
        return { kind: 'EXTENSION', newDueDate, reason: reason.trim() };
      }
      case 'REASIGNACION': {
        const { memberIds, reason } = input.payload;
        if (!Array.isArray(memberIds) || memberIds.length === 0) {
          throw new BadRequestException(
            'Debes proponer al menos una persona para reasignar',
          );
        }
        this.validateReason(reason, 'reasignar');
        const members = await this.resolveActiveMembers(memberIds);
        return {
          kind: 'REASIGNACION',
          memberIds: members.map((m) => m.id),
          memberNames: members.map((m) => m.name),
          reason: reason.trim(),
        };
      }
      case 'CAMBIO_ESTADO': {
        const { status, reason } = input.payload;
        if (!TASK_STATUSES.includes(status)) {
          throw new BadRequestException(
            `El estado debe ser uno de: ${TASK_STATUSES.join(', ')}`,
          );
        }
        if (status === 'EXTENDIDO') {
          this.validateReason(reason ?? '', 'pasar a EXTENDIDO');
        }
        return {
          kind: 'CAMBIO_ESTADO',
          status,
          reason: reason?.trim() ? reason.trim() : null,
        };
      }
    }
  }

  private async resolveActiveMembers(
    memberIds: number[],
  ): Promise<{ id: number; name: string }[]> {
    if (memberIds.length === 0) {
      return [];
    }
    if (memberIds.some((id) => !Number.isInteger(id))) {
      throw new BadRequestException(
        'Cada memberId debe ser un número entero',
      );
    }
    const unique = [...new Set(memberIds)];
    const members = await this.requestsRepository.findMembersByIds(unique);
    if (members.length !== unique.length) {
      const found = new Set(members.map((m) => m.id));
      const missing = unique.filter((id) => !found.has(id));
      throw new NotFoundException(
        `Persona(s) no encontrada(s): ${missing.map((id) => `#${id}`).join(', ')}`,
      );
    }
    const inactive = members.filter((m) => !m.active);
    if (inactive.length > 0) {
      throw new ConflictException(
        `Persona(s) inactiva(s): ${inactive.map((m) => m.name).join(', ')}`,
      );
    }
    return members.map((m) => ({ id: m.id, name: m.name }));
  }

  private validateDate(value: string, label: string): void {
    if (
      typeof value !== 'string' ||
      !DATE_RE.test(value) ||
      Number.isNaN(new Date(`${value}T00:00:00`).getTime())
    ) {
      throw new BadRequestException(
        `${label} debe ser una fecha válida con formato YYYY-MM-DD`,
      );
    }
  }

  private validateReason(reason: string, action: string): void {
    if (typeof reason !== 'string' || !reason.trim()) {
      throw new BadRequestException(
        `La razón es obligatoria para ${action}`,
      );
    }
  }

  // --- Helpers ---

  private async getRequestOrFail(
    id: number,
  ): Promise<TeamRequestWithRelations> {
    const request = await this.requestsRepository.findById(id);
    if (!request) {
      throw new NotFoundException(`Solicitud #${id} no encontrada`);
    }
    return request;
  }

  private ensurePending(request: TeamRequestWithRelations): void {
    if (request.status === 'APROBADA') {
      throw new ConflictException('Esta solicitud ya fue aprobada');
    }
    if (request.status === 'RECHAZADA') {
      throw new ConflictException('Esta solicitud ya fue rechazada');
    }
  }

  private fireNotification(fn: () => Promise<void>): void {
    fn().catch((err: unknown) => {
      this.logger.error(
        `Error enviando notificación de Telegram: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }
}
