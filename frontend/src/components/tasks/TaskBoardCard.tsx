import type { CSSProperties, ReactNode } from 'react';
import { Avatar, Tooltip, Typography } from 'antd';
import { LinkOutlined } from '@ant-design/icons';
import { DueDateCell } from './DueDateCell';
import { colors, radii, shadows } from '../../theme';
import type { TaskResponse } from '../../types/task.types';

interface TaskBoardCardProps {
  task: TaskResponse;
  /** Estilo "levantada" durante el drag (scale + glow accent). */
  lifted?: boolean;
  style?: CSSProperties;
  /** Slot superior derecho (menú de acciones accesible de la card). */
  extra?: ReactNode;
}

/**
 * Card de pendiente en el tablero Kanban: título, cliente, avatares de
 * asignados, fecha con indicador de vencimiento y contador de links.
 */
export function TaskBoardCard({ task, lifted = false, style, extra }: TaskBoardCardProps) {
  return (
    <div
      style={{
        background: lifted ? colors.surfaceGlassHover : colors.surfaceGlass,
        border: `1px solid ${lifted ? colors.accent : colors.borderGlass}`,
        borderRadius: radii.base,
        boxShadow: lifted
          ? `${shadows.glassInset}, ${shadows.accentGlow}`
          : shadows.glassInset,
        padding: '12px 14px',
        transform: lifted ? 'scale(1.03)' : undefined,
        cursor: lifted ? 'grabbing' : 'grab',
        ...style,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 4,
        }}
      >
        <span
          className="tnum"
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.04em',
            color: colors.textMuted,
          }}
        >
          #{task.id}
        </span>
        {extra}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          lineHeight: 1.35,
          color: colors.text,
          marginBottom: 2,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {task.title}
      </div>
      <div
        style={{
          fontSize: 12,
          color: colors.textMuted,
          marginBottom: 10,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {task.client.name}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ fontSize: 12 }}>
          <DueDateCell dueDate={task.dueDate} status={task.status} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {task.links.length > 0 && (
            <Typography.Text
              type="secondary"
              className="tnum"
              style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 3 }}
              aria-label={`${task.links.length} links`}
            >
              <LinkOutlined aria-hidden /> {task.links.length}
            </Typography.Text>
          )}
          {task.assignees.length > 0 && (
            <Avatar.Group max={{ count: 3 }} size={22}>
              {task.assignees.map((assignee) => (
                <Tooltip key={assignee.memberId} title={assignee.name}>
                  <Avatar size={22} style={{ fontSize: 11 }}>
                    {assignee.name.charAt(0).toUpperCase()}
                  </Avatar>
                </Tooltip>
              ))}
            </Avatar.Group>
          )}
        </div>
      </div>
    </div>
  );
}
