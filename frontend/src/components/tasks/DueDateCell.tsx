import { Space, Typography } from 'antd';
import {
  DUE_STATUS_LABELS,
  formatDate,
  getDueStatus,
} from '../../services/date.service';
import { colors } from '../../theme';
import type { TaskStatus } from '../../types/task.types';
import { TagPill } from '../common/TagPill';

interface DueDateCellProps {
  dueDate: string | null;
  status: TaskStatus;
}

/** Fecha de entrega (tabular-nums) con indicador vencida / hoy / mañana. */
export function DueDateCell({ dueDate, status }: DueDateCellProps) {
  if (!dueDate) {
    return <Typography.Text type="secondary">—</Typography.Text>;
  }

  const isActive = status === 'ASIGNADO' || status === 'EXTENDIDO';
  const due = getDueStatus(dueDate);
  const overdue = isActive && due === 'vencido';

  return (
    <Space size={6} wrap>
      <Typography.Text
        className="tnum"
        style={overdue ? { color: colors.error, fontWeight: 600 } : undefined}
      >
        {formatDate(dueDate)}
      </Typography.Text>
      {isActive && due === 'vencido' && (
        <TagPill color={colors.error} size="sm">
          {DUE_STATUS_LABELS.vencido}
        </TagPill>
      )}
      {isActive && due === 'hoy' && (
        <TagPill color={colors.warning} size="sm">
          {DUE_STATUS_LABELS.hoy}
        </TagPill>
      )}
      {isActive && due === 'manana' && (
        <TagPill color={colors.info} size="sm">
          {DUE_STATUS_LABELS.manana}
        </TagPill>
      )}
    </Space>
  );
}
