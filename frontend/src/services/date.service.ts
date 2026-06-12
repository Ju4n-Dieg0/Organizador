import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

export const DATE_FORMAT = 'DD/MM/YYYY';
export const DATETIME_FORMAT = 'DD/MM/YYYY HH:mm';

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return dayjs(iso).format(DATE_FORMAT);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return dayjs(iso).format(DATETIME_FORMAT);
}

/** Tiempo relativo en español («hace 2 horas»). El locale es se fija en main.tsx. */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  return dayjs(iso).fromNow();
}

export type DueStatus = 'vencido' | 'hoy' | 'manana' | 'futuro' | 'sin-fecha';

/** Clasifica una fecha de entrega respecto a hoy (a nivel de día). */
export function getDueStatus(dueDate: string | null | undefined): DueStatus {
  if (!dueDate) return 'sin-fecha';
  const due = dayjs(dueDate).startOf('day');
  const today = dayjs().startOf('day');
  const diff = due.diff(today, 'day');
  if (diff < 0) return 'vencido';
  if (diff === 0) return 'hoy';
  if (diff === 1) return 'manana';
  return 'futuro';
}

export const DUE_STATUS_LABELS: Record<DueStatus, string> = {
  vencido: 'Vencida',
  hoy: 'Vence hoy',
  manana: 'Vence mañana',
  futuro: '',
  'sin-fecha': 'Sin fecha',
};

export function isOverdue(dueDate: string | null | undefined): boolean {
  return getDueStatus(dueDate) === 'vencido';
}
