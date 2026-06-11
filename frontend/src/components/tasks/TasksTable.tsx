import { Avatar, Button, Popconfirm, Space, Table, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  SwapOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { StatusTag } from '../common/StatusTag';
import { LinksList } from '../common/LinksList';
import { DueDateCell } from './DueDateCell';
import { useCompleteTask } from '../../hooks/useTasks';
import { clientDetailPath } from '../../constants/routes';
import type { TaskResponse } from '../../types/task.types';

interface TasksTableProps {
  tasks: TaskResponse[];
  loading: boolean;
  onView: (task: TaskResponse) => void;
  onAssign: (task: TaskResponse) => void;
  onReassign: (task: TaskResponse) => void;
  onExtend: (task: TaskResponse) => void;
  /** Oculta la columna de cliente (en el detalle de cliente). */
  hideClientColumn?: boolean;
}

/** Tabla densa de pendientes con acciones por fila según estado. */
export function TasksTable({
  tasks,
  loading,
  onView,
  onAssign,
  onReassign,
  onExtend,
  hideClientColumn = false,
}: TasksTableProps) {
  const completeTask = useCompleteTask();

  const columns: ColumnsType<TaskResponse> = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 64,
      render: (id: number) => (
        <Typography.Text type="secondary" className="tnum" style={{ fontWeight: 600 }}>
          #{id}
        </Typography.Text>
      ),
    },
    {
      title: 'Título',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (title: string, task) => (
        <Typography.Link onClick={() => onView(task)}>{title}</Typography.Link>
      ),
    },
    ...(hideClientColumn
      ? []
      : [
          {
            title: 'Cliente',
            key: 'client',
            width: 160,
            ellipsis: true,
            render: (_: unknown, task: TaskResponse) => (
              <Link to={clientDetailPath(task.client.id)}>{task.client.name}</Link>
            ),
          },
        ]),
    {
      title: 'Estado',
      key: 'status',
      width: 110,
      render: (_, task) => <StatusTag status={task.status} />,
    },
    {
      title: 'Asignados',
      key: 'assignees',
      width: 140,
      render: (_, task) =>
        task.assignees.length === 0 ? (
          <Typography.Text type="secondary">—</Typography.Text>
        ) : (
          <Avatar.Group max={{ count: 3 }} size="small">
            {task.assignees.map((assignee) => (
              <Tooltip key={assignee.memberId} title={assignee.name}>
                <Avatar size="small">
                  {assignee.name.charAt(0).toUpperCase()}
                </Avatar>
              </Tooltip>
            ))}
          </Avatar.Group>
        ),
    },
    {
      title: 'Entrega',
      key: 'dueDate',
      width: 200,
      render: (_, task) => <DueDateCell dueDate={task.dueDate} status={task.status} />,
    },
    {
      title: 'Links',
      key: 'links',
      width: 110,
      render: (_, task) => <LinksList links={task.links} mode="compact" />,
    },
    {
      title: 'Acciones',
      key: 'actions',
      width: 190,
      render: (_, task) => {
        const canAssign = task.status === 'PENDIENTE';
        const canReassign = task.status === 'ASIGNADO' || task.status === 'EXTENDIDO';
        const canExtend = task.status === 'ASIGNADO' || task.status === 'EXTENDIDO';
        const canComplete = task.status === 'ASIGNADO' || task.status === 'EXTENDIDO';
        return (
          <Space size={2}>
            <Tooltip title="Ver detalle">
              <Button
                type="text"
                icon={<EyeOutlined />}
                aria-label={`Ver detalle del pendiente ${task.title}`}
                onClick={() => onView(task)}
              />
            </Tooltip>
            {canAssign && (
              <Tooltip title="Asignar">
                <Button
                  type="text"
                  icon={<UserAddOutlined />}
                  aria-label={`Asignar pendiente ${task.title}`}
                  onClick={() => onAssign(task)}
                />
              </Tooltip>
            )}
            {canReassign && (
              <Tooltip title="Reasignar">
                <Button
                  type="text"
                  icon={<SwapOutlined />}
                  aria-label={`Reasignar pendiente ${task.title}`}
                  onClick={() => onReassign(task)}
                />
              </Tooltip>
            )}
            {canExtend && (
              <Tooltip title="Extender fecha">
                <Button
                  type="text"
                  icon={<ClockCircleOutlined />}
                  aria-label={`Extender fecha del pendiente ${task.title}`}
                  onClick={() => onExtend(task)}
                />
              </Tooltip>
            )}
            {canComplete && (
              <Popconfirm
                title="Terminar pendiente"
                description="¿Marcar este pendiente como terminado?"
                okText="Sí, terminar"
                cancelText="Cancelar"
                onConfirm={() => completeTask.mutate(task.id)}
              >
                <Tooltip title="Terminar">
                  <Button
                    type="text"
                    icon={<CheckOutlined />}
                    aria-label={`Terminar pendiente ${task.title}`}
                    loading={
                      completeTask.isPending && completeTask.variables === task.id
                    }
                  />
                </Tooltip>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <Table<TaskResponse>
      rowKey="id"
      size="small"
      columns={columns}
      dataSource={tasks}
      loading={loading}
      pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `${total} pendientes` }}
      scroll={{ x: 960 }}
    />
  );
}
