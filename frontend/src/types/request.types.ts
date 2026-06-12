import type { TaskStatus } from './task.types';

export type TeamRequestType =
  | 'CREAR_PENDIENTE'
  | 'EXTENSION'
  | 'REASIGNACION'
  | 'CAMBIO_ESTADO';

export type TeamRequestStatus = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';

/** Payload tipado por `kind` (espejo exacto de docs/SPEC.md). */
export type TeamRequestPayload =
  | {
      kind: 'CREAR_PENDIENTE';
      clientId: number;
      clientName: string;
      title: string;
      memberIds: number[];
      memberNames: string[];
      /** Con memberIds + dueDate, aprobar crea Y asigna. */
      dueDate: string | null;
    }
  | { kind: 'EXTENSION'; newDueDate: string; reason: string }
  | {
      kind: 'REASIGNACION';
      memberIds: number[];
      memberNames: string[];
      reason: string;
    }
  | { kind: 'CAMBIO_ESTADO'; status: TaskStatus; reason: string | null };

export interface TeamRequestResponse {
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
  /** Resumen humano en español que arma el backend (única fuente). */
  summary: string;
  rejectionReason: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RejectRequestRequest {
  reason: string;
}

/** Filtro del query param `status` de GET /api/requests. */
export type RequestStatusFilter = TeamRequestStatus | 'all';
