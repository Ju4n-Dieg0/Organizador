import type {
  TeamRequestStatus,
  TeamRequestType,
} from '../types/request.types';

export const REQUEST_TYPE_LABELS: Record<TeamRequestType, string> = {
  CREAR_PENDIENTE: 'Nuevo pendiente',
  EXTENSION: 'Extensión',
  REASIGNACION: 'Reasignación',
  CAMBIO_ESTADO: 'Cambio de estado',
};

export const REQUEST_STATUS_LABELS: Record<TeamRequestStatus, string> = {
  PENDIENTE: 'Pendiente',
  APROBADA: 'Aprobada',
  RECHAZADA: 'Rechazada',
};
