import type { TaskEventType, TaskStatus } from '../types/task.types';

export const TASK_STATUSES: TaskStatus[] = [
  'PENDIENTE',
  'ASIGNADO',
  'TERMINADO',
  'EXTENDIDO',
];

/** Estados considerados "abiertos" (no terminados). */
export const OPEN_TASK_STATUSES: TaskStatus[] = [
  'PENDIENTE',
  'ASIGNADO',
  'EXTENDIDO',
];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  PENDIENTE: 'Pendiente',
  ASIGNADO: 'Asignado',
  TERMINADO: 'Terminado',
  EXTENDIDO: 'Extendido',
};

export const TASK_EVENT_TYPE_LABELS: Record<TaskEventType, string> = {
  CREACION: 'Creación',
  ASIGNACION: 'Asignación',
  REASIGNACION: 'Reasignación',
  EXTENSION: 'Extensión',
  CAMBIO_ESTADO: 'Cambio de estado',
};
