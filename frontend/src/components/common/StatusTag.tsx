import { TASK_STATUS_LABELS } from '../../constants/taskStatus';
import { taskStatusColor } from '../../theme';
import type { TaskStatus } from '../../types/task.types';
import { TagPill } from './TagPill';

interface StatusTagProps {
  status: TaskStatus;
  size?: 'sm' | 'md';
}

/**
 * Tag semántico del estado de un pendiente (MASTER):
 * siempre con texto; fondo 12% y borde 25% del color semántico.
 */
export function StatusTag({ status, size = 'md' }: StatusTagProps) {
  return (
    <TagPill color={taskStatusColor[status]} size={size}>
      {TASK_STATUS_LABELS[status]}
    </TagPill>
  );
}
