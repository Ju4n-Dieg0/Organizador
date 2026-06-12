import { TaskStatus } from '../../tasks/dto/task-response.dto';

export const TEAM_REQUEST_TYPES = [
  'CREAR_PENDIENTE',
  'EXTENSION',
  'REASIGNACION',
  'CAMBIO_ESTADO',
] as const;
export type TeamRequestType = (typeof TEAM_REQUEST_TYPES)[number];

export const TEAM_REQUEST_STATUSES = [
  'PENDIENTE',
  'APROBADA',
  'RECHAZADA',
] as const;
export type TeamRequestStatus = (typeof TEAM_REQUEST_STATUSES)[number];

/**
 * Payload tipado de una solicitud (se persiste como Json validado al crear;
 * el mapper lo devuelve tipado). Espejo exacto del contrato en docs/SPEC.md.
 */
export type TeamRequestPayload =
  | {
      kind: 'CREAR_PENDIENTE';
      clientId: number;
      clientName: string;
      title: string;
      memberIds: number[];
      memberNames: string[];
      dueDate: string | null; // con memberIds+dueDate, approve crea Y asigna
    }
  | { kind: 'EXTENSION'; newDueDate: string; reason: string }
  | {
      kind: 'REASIGNACION';
      memberIds: number[];
      memberNames: string[];
      reason: string;
    }
  | { kind: 'CAMBIO_ESTADO'; status: TaskStatus; reason: string | null };

export class TeamRequestResponseDto {
  id: number;
  type: TeamRequestType;
  status: TeamRequestStatus;
  requester: { id: number; name: string };
  task: {
    id: number;
    title: string;
    clientName: string;
    status: TaskStatus;
  } | null;
  payload: TeamRequestPayload;
  /** Resumen humano en español (única fuente: web y Telegram muestran el mismo). */
  summary: string;
  rejectionReason: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
