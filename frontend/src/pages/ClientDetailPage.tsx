import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Button,
  Descriptions,
  Flex,
  Result,
  Skeleton,
  Typography,
} from 'antd';
import { ArrowLeftOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { PageTransition } from '../components/common/PageTransition';
import { PageHeader } from '../components/common/PageHeader';
import { GlassCard } from '../components/common/GlassCard';
import { LinksList } from '../components/common/LinksList';
import { TagPill } from '../components/common/TagPill';
import { ClientFormModal } from '../components/clients/ClientFormModal';
import { TasksTable } from '../components/tasks/TasksTable';
import { TaskFormModal } from '../components/tasks/TaskFormModal';
import { TaskDetailDrawer } from '../components/tasks/TaskDetailDrawer';
import { AssignTaskModal } from '../components/tasks/AssignTaskModal';
import { ReassignTaskModal } from '../components/tasks/ReassignTaskModal';
import { ExtendTaskModal } from '../components/tasks/ExtendTaskModal';
import { useClient } from '../hooks/useClients';
import { useTasks } from '../hooks/useTasks';
import { formatDate } from '../services/date.service';
import { ROUTES } from '../constants/routes';
import { colors } from '../theme';
import type { TaskResponse } from '../types/task.types';

export function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const clientId = Number(params.id);
  const { data: client, isLoading, isError } = useClient(clientId);
  const { data: tasks, isLoading: tasksLoading } = useTasks({ clientId });

  const [editOpen, setEditOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState<number | null>(null);
  const [assignTask, setAssignTask] = useState<TaskResponse | null>(null);
  const [reassignTask, setReassignTask] = useState<TaskResponse | null>(null);
  const [extendTask, setExtendTask] = useState<TaskResponse | null>(null);

  if (isError) {
    return (
      <Result
        status="404"
        title="Cliente no encontrado"
        subTitle="El cliente que buscas no existe o fue eliminado."
        extra={
          <Link to={ROUTES.clients}>
            <Button type="primary" icon={<ArrowLeftOutlined />}>
              Volver a clientes
            </Button>
          </Link>
        }
      />
    );
  }

  if (isLoading || !client) {
    return <Skeleton active paragraph={{ rows: 8 }} />;
  }

  return (
    <PageTransition>
      <Link
        to={ROUTES.clients}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 12,
          fontSize: 13,
          color: colors.textMuted,
        }}
      >
        <ArrowLeftOutlined aria-hidden /> Clientes
      </Link>
      <PageHeader
        eyebrow="Cliente"
        title={client.name}
        titleExtra={
          client.active ? (
            <TagPill color={colors.success}>Activo</TagPill>
          ) : (
            <TagPill color={colors.textMuted}>Inactivo</TagPill>
          )
        }
        extra={
          <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
            Editar cliente
          </Button>
        }
      />

      <GlassCard style={{ marginBottom: 24 }}>
        <Descriptions
          column={{ xs: 1, sm: 2 }}
          size="small"
          items={[
            {
              key: 'plan',
              label: 'Plan',
              children: client.plan ? (
                client.plan.name
              ) : (
                <Typography.Text type="secondary">Sin plan</Typography.Text>
              ),
            },
            {
              key: 'openTasks',
              label: 'Pendientes abiertos',
              children: <span className="tnum">{client.openTaskCount}</span>,
            },
            {
              key: 'createdAt',
              label: 'Cliente desde',
              children: <span className="tnum">{formatDate(client.createdAt)}</span>,
            },
            {
              key: 'driveLinks',
              label: 'Links de Drive',
              children: <LinksList links={client.driveLinks} mode="full" />,
            },
          ]}
        />
      </GlassCard>

      <GlassCard>
        <Flex justify="space-between" align="center" wrap gap={12} style={{ marginBottom: 16 }}>
          {/* h2 (sin salto h1→h5); tamaño visual de nivel 5 vía fontSize. */}
          <Typography.Title
            level={2}
            style={{ margin: 0, letterSpacing: '-0.01em', fontSize: 16 }}
          >
            Pendientes del cliente
          </Typography.Title>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setTaskModalOpen(true)}
          >
            Nuevo pendiente
          </Button>
        </Flex>
        <TasksTable
          tasks={tasks ?? []}
          loading={tasksLoading}
          hideClientColumn
          onView={(task) => setDetailTaskId(task.id)}
          onAssign={setAssignTask}
          onReassign={setReassignTask}
          onExtend={setExtendTask}
        />
      </GlassCard>

      <ClientFormModal
        open={editOpen}
        client={client}
        onClose={() => setEditOpen(false)}
      />
      <TaskFormModal
        open={taskModalOpen}
        fixedClientId={client.id}
        onClose={() => setTaskModalOpen(false)}
      />
      <TaskDetailDrawer taskId={detailTaskId} onClose={() => setDetailTaskId(null)} />
      <AssignTaskModal task={assignTask} onClose={() => setAssignTask(null)} />
      <ReassignTaskModal task={reassignTask} onClose={() => setReassignTask(null)} />
      <ExtendTaskModal task={extendTask} onClose={() => setExtendTask(null)} />
    </PageTransition>
  );
}
