import { TaskStatus } from '../tasks/dto/task-response.dto';
import {
  TeamRequestPayload,
  TeamRequestResponseDto,
  TeamRequestStatus,
  TeamRequestType,
} from './dto/team-request-response.dto';
import { TeamRequestWithRelations } from './requests.repository';

export class RequestsMapper {
  static toResponse(request: TeamRequestWithRelations): TeamRequestResponseDto {
    const payload = request.payload as unknown as TeamRequestPayload;
    const task = request.task
      ? {
          id: request.task.id,
          title: request.task.title,
          clientName: request.task.client.name,
          status: request.task.status as TaskStatus,
        }
      : null;
    return {
      id: request.id,
      type: request.type as TeamRequestType,
      status: request.status as TeamRequestStatus,
      requester: { id: request.requester.id, name: request.requester.name },
      task,
      payload,
      summary: RequestsMapper.buildSummary(
        request.requester.name,
        payload,
        task,
      ),
      rejectionReason: request.rejectionReason,
      resolvedBy: request.resolvedBy,
      resolvedAt: request.resolvedAt ? request.resolvedAt.toISOString() : null,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
    };
  }

  /**
   * Resumen humano en español. Única fuente: la web y Telegram muestran
   * exactamente este texto.
   */
  private static buildSummary(
    requesterName: string,
    payload: TeamRequestPayload,
    task: { title: string; clientName: string } | null,
  ): string {
    const taskLabel = task
      ? `"${task.title}" (${task.clientName})`
      : 'un pendiente eliminado';

    switch (payload.kind) {
      case 'CREAR_PENDIENTE': {
        let summary = `${requesterName} solicita crear el pendiente "${payload.title}" para ${payload.clientName}`;
        if (payload.memberNames.length > 0) {
          summary += `, asignado a ${payload.memberNames.join(', ')}`;
        }
        if (payload.dueDate) {
          summary += ` con entrega el ${payload.dueDate}`;
        }
        return `${summary}.`;
      }
      case 'EXTENSION':
        return `${requesterName} solicita extender ${taskLabel} hasta ${payload.newDueDate}. Razón: ${payload.reason}`;
      case 'REASIGNACION':
        return `${requesterName} solicita reasignar ${taskLabel} a ${payload.memberNames.join(', ')}. Razón: ${payload.reason}`;
      case 'CAMBIO_ESTADO': {
        const base = `${requesterName} solicita cambiar ${taskLabel} a ${payload.status}.`;
        return payload.reason ? `${base} Razón: ${payload.reason}` : base;
      }
    }
  }
}
