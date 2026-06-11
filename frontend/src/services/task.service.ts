import {
  TASK_EVENT_TYPE_LABELS,
  TASK_STATUS_LABELS,
} from '../constants/taskStatus';
import type {
  TaskEventResponse,
  TaskResponse,
  TaskStatus,
} from '../types/task.types';
import { formatDate, getDueStatus } from './date.service';

/** Agrupa pendientes por estado para las KPI cards del dashboard. */
export function countTasksByStatus(
  tasks: TaskResponse[],
): Record<TaskStatus, number> {
  const counts: Record<TaskStatus, number> = {
    PENDIENTE: 0,
    ASIGNADO: 0,
    TERMINADO: 0,
    EXTENDIDO: 0,
  };
  for (const task of tasks) {
    counts[task.status] += 1;
  }
  return counts;
}

export interface DueSummary {
  overdue: number;
  dueToday: number;
  dueTomorrow: number;
}

/** Resumen de entregas vencidas / de hoy / de mañana entre tareas activas. */
export function getDueSummary(tasks: TaskResponse[]): DueSummary {
  const summary: DueSummary = { overdue: 0, dueToday: 0, dueTomorrow: 0 };
  for (const task of tasks) {
    if (task.status !== 'ASIGNADO' && task.status !== 'EXTENDIDO') continue;
    const due = getDueStatus(task.dueDate);
    if (due === 'vencido') summary.overdue += 1;
    else if (due === 'hoy') summary.dueToday += 1;
    else if (due === 'manana') summary.dueTomorrow += 1;
  }
  return summary;
}

/** Próximas entregas: ASIGNADO/EXTENDIDO ordenadas por dueDate ascendente. */
export function getUpcomingDeliveries(tasks: TaskResponse[]): TaskResponse[] {
  return tasks
    .filter(
      (task) =>
        (task.status === 'ASIGNADO' || task.status === 'EXTENDIDO') &&
        task.dueDate !== null,
    )
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
}

function statusLabel(status: TaskStatus | null): string {
  return status ? TASK_STATUS_LABELS[status] : '—';
}

/** Texto legible en español para un evento del historial. */
export function formatTaskEvent(event: TaskEventResponse): string {
  const parts: string[] = [];
  switch (event.type) {
    case 'CREACION':
      parts.push('Se creó el pendiente');
      break;
    case 'ASIGNACION':
      parts.push('Se asignó el pendiente');
      break;
    case 'REASIGNACION':
      parts.push('Se reasignó el pendiente');
      break;
    case 'EXTENSION':
      parts.push('Se extendió la fecha de entrega');
      break;
    case 'CAMBIO_ESTADO':
      parts.push('Cambio de estado');
      break;
  }
  if (event.fromStatus || event.toStatus) {
    parts.push(
      `de ${statusLabel(event.fromStatus)} a ${statusLabel(event.toStatus)}`,
    );
  }
  return parts.join(' ');
}

export function taskEventTitle(event: TaskEventResponse): string {
  return `${TASK_EVENT_TYPE_LABELS[event.type]} · ${formatDate(event.createdAt)}`;
}
