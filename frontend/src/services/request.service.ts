import { getApiErrorStatus } from '../api/http';
import { TASK_STATUS_LABELS } from '../constants/taskStatus';
import type { TeamRequestPayload } from '../types/request.types';
import { formatDate } from './date.service';

export interface RequestDetailItem {
  label: string;
  value: string;
}

/**
 * Datos propuestos de una solicitud como pares label/valor legibles,
 * según el `kind` del payload (el `summary` ya lo arma el backend;
 * esto complementa con el detalle estructurado).
 */
export function getRequestDetails(
  payload: TeamRequestPayload,
): RequestDetailItem[] {
  switch (payload.kind) {
    case 'CREAR_PENDIENTE': {
      const items: RequestDetailItem[] = [
        { label: 'Cliente', value: payload.clientName },
        { label: 'Título', value: payload.title },
      ];
      if (payload.memberNames.length > 0) {
        items.push({ label: 'Asignar a', value: payload.memberNames.join(', ') });
      }
      if (payload.dueDate) {
        items.push({ label: 'Entrega', value: formatDate(payload.dueDate) });
      }
      return items;
    }
    case 'EXTENSION':
      return [
        { label: 'Nueva fecha', value: formatDate(payload.newDueDate) },
        { label: 'Razón', value: payload.reason },
      ];
    case 'REASIGNACION':
      return [
        { label: 'Reasignar a', value: payload.memberNames.join(', ') },
        { label: 'Razón', value: payload.reason },
      ];
    case 'CAMBIO_ESTADO': {
      const items: RequestDetailItem[] = [
        { label: 'Nuevo estado', value: TASK_STATUS_LABELS[payload.status] },
      ];
      if (payload.reason) {
        items.push({ label: 'Razón', value: payload.reason });
      }
      return items;
    }
  }
}

/**
 * true si el error es el 409 de idempotencia («la solicitud ya fue resuelta»,
 * p. ej. desde Telegram mientras la web estaba abierta).
 */
export function isRequestAlreadyResolved(error: unknown): boolean {
  return getApiErrorStatus(error) === 409;
}
