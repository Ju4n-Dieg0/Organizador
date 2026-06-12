import { Descriptions, Drawer, Skeleton, Space, Tag, Timeline, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { useTask } from '../../hooks/useTasks';
import { StatusTag } from '../common/StatusTag';
import { TaskCommentsSection } from './TaskCommentsSection';
import { LinksList } from '../common/LinksList';
import { DueDateCell } from './DueDateCell';
import { formatDate, formatDateTime } from '../../services/date.service';
import { formatTaskEvent } from '../../services/task.service';
import { TASK_EVENT_TYPE_LABELS } from '../../constants/taskStatus';
import { clientDetailPath } from '../../constants/routes';
import { colors } from '../../theme';
import type { TaskEventResponse } from '../../types/task.types';

interface TaskDetailDrawerProps {
  taskId: number | null;
  onClose: () => void;
}

/** Color semántico del punto del timeline (tokens del design system). */
function eventColor(event: TaskEventResponse): string {
  switch (event.type) {
    case 'CREACION':
      return colors.textMuted;
    case 'ASIGNACION':
    case 'REASIGNACION':
      return colors.info;
    case 'EXTENSION':
      return colors.warning;
    case 'CAMBIO_ESTADO':
      return event.toStatus === 'TERMINADO' ? colors.success : colors.info;
  }
}

/** Drawer con el detalle completo de un pendiente y su historial de eventos. */
export function TaskDetailDrawer({ taskId, onClose }: TaskDetailDrawerProps) {
  const { data: task, isLoading } = useTask(taskId ?? undefined);

  return (
    <Drawer
      open={taskId !== null}
      onClose={onClose}
      width="min(520px, 100vw)"
      title={task ? `Pendiente #${task.id}` : 'Detalle del pendiente'}
    >
      {isLoading || !task ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <Space direction="vertical" size={24} style={{ width: '100%' }}>
          <Descriptions
            column={1}
            size="small"
            bordered
            items={[
              {
                key: 'title',
                label: 'Título',
                children: <Typography.Text strong>{task.title}</Typography.Text>,
              },
              {
                key: 'description',
                label: 'Descripción',
                children: task.description ? (
                  <Typography.Paragraph style={{ marginBottom: 0 }}>
                    {task.description}
                  </Typography.Paragraph>
                ) : (
                  <Typography.Text type="secondary">Sin descripción</Typography.Text>
                ),
              },
              {
                key: 'client',
                label: 'Cliente',
                children: (
                  <Link to={clientDetailPath(task.client.id)} onClick={onClose}>
                    {task.client.name}
                  </Link>
                ),
              },
              {
                key: 'status',
                label: 'Estado',
                children: <StatusTag status={task.status} />,
              },
              {
                key: 'dueDate',
                label: 'Fecha de entrega',
                children: <DueDateCell dueDate={task.dueDate} status={task.status} />,
              },
              {
                key: 'assignees',
                label: 'Asignados',
                children:
                  task.assignees.length === 0 ? (
                    <Typography.Text type="secondary">Sin asignar</Typography.Text>
                  ) : (
                    <Space size={4} wrap>
                      {task.assignees.map((assignee) => (
                        <Tag key={assignee.memberId}>
                          {assignee.name} · desde {formatDate(assignee.assignedAt)}
                        </Tag>
                      ))}
                    </Space>
                  ),
              },
              {
                key: 'links',
                label: 'Links',
                children: <LinksList links={task.links} mode="full" />,
              },
              {
                key: 'createdAt',
                label: 'Creado',
                children: formatDateTime(task.createdAt),
              },
            ]}
          />

          <div>
            {/* h2 (sin salto h1→h5); tamaño visual de nivel 5 vía fontSize. */}
            <Typography.Title level={2} style={{ fontSize: 16 }}>
              Historial
            </Typography.Title>
            <Timeline
              items={task.events.map((event) => ({
                key: event.id,
                color: eventColor(event),
                children: (
                  <Space direction="vertical" size={0}>
                    <Typography.Text strong>
                      {TASK_EVENT_TYPE_LABELS[event.type]}
                    </Typography.Text>
                    <Typography.Text>{formatTaskEvent(event)}</Typography.Text>
                    {event.reason && (
                      <Typography.Text type="secondary">
                        Razón: {event.reason}
                      </Typography.Text>
                    )}
                    {event.detail && (
                      <Typography.Text type="secondary">{event.detail}</Typography.Text>
                    )}
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {formatDateTime(event.createdAt)}
                    </Typography.Text>
                  </Space>
                ),
              }))}
            />
          </div>

          <TaskCommentsSection taskId={task.id} />
        </Space>
      )}
    </Drawer>
  );
}
