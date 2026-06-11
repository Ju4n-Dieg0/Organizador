import { useState } from 'react';
import { Button, Flex, Input, Segmented, Select } from 'antd';
import { AppstoreOutlined, PlusOutlined, TableOutlined } from '@ant-design/icons';
import { PageTransition } from '../components/common/PageTransition';
import { PageHeader } from '../components/common/PageHeader';
import { GlassCard } from '../components/common/GlassCard';
import { TasksTable } from '../components/tasks/TasksTable';
import { TaskBoard } from '../components/tasks/TaskBoard';
import { TaskFormModal } from '../components/tasks/TaskFormModal';
import { TaskDetailDrawer } from '../components/tasks/TaskDetailDrawer';
import { AssignTaskModal } from '../components/tasks/AssignTaskModal';
import { ReassignTaskModal } from '../components/tasks/ReassignTaskModal';
import { ExtendTaskModal } from '../components/tasks/ExtendTaskModal';
import { useTasks } from '../hooks/useTasks';
import { useClients } from '../hooks/useClients';
import { useTeamMembers } from '../hooks/useTeam';
import { TASK_STATUSES, TASK_STATUS_LABELS } from '../constants/taskStatus';
import { STORAGE_KEYS } from '../constants/api';
import type { TaskResponse, TaskStatus } from '../types/task.types';

type TasksView = 'table' | 'kanban';

function getStoredView(): TasksView {
  return localStorage.getItem(STORAGE_KEYS.tasksView) === 'kanban' ? 'kanban' : 'table';
}

const VIEW_OPTIONS = [
  { label: 'Tabla', value: 'table', icon: <TableOutlined aria-hidden /> },
  { label: 'Kanban', value: 'kanban', icon: <AppstoreOutlined aria-hidden /> },
];

export function TasksPage() {
  const [view, setView] = useState<TasksView>(getStoredView);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | undefined>();
  const [clientFilter, setClientFilter] = useState<number | undefined>();
  const [memberFilter, setMemberFilter] = useState<number | undefined>();
  const [search, setSearch] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState<number | null>(null);
  const [assignTask, setAssignTask] = useState<TaskResponse | null>(null);
  const [reassignTask, setReassignTask] = useState<TaskResponse | null>(null);
  const [extendTask, setExtendTask] = useState<TaskResponse | null>(null);

  const isKanban = view === 'kanban';

  const { data: tasks, isLoading } = useTasks({
    // En Kanban las columnas ya separan por estado.
    status: isKanban ? undefined : statusFilter,
    clientId: clientFilter,
    memberId: memberFilter,
    search,
  });
  const { data: clients } = useClients({ status: 'all' });
  const { data: members } = useTeamMembers('all');

  const changeView = (next: TasksView) => {
    setView(next);
    localStorage.setItem(STORAGE_KEYS.tasksView, next);
  };

  return (
    <PageTransition>
      <PageHeader
        eyebrow="Flujo de trabajo"
        title="Pendientes"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            Nuevo pendiente
          </Button>
        }
      />

      <GlassCard>
        {/* Excepción a11y documentada: esto es una toolbar de filtros compacta,
            no un formulario; cada control lleva aria-label en vez de label visible. */}
        <Flex gap={12} wrap justify="space-between" style={{ marginBottom: 16 }}>
          <Flex gap={12} wrap>
            {!isKanban && (
              <Select
                allowClear
                placeholder="Estado"
                value={statusFilter}
                onChange={setStatusFilter}
                style={{ width: 160 }}
                aria-label="Filtrar por estado"
                options={TASK_STATUSES.map((status) => ({
                  value: status,
                  label: TASK_STATUS_LABELS[status],
                }))}
              />
            )}
            <Select
              allowClear
              showSearch
              placeholder="Cliente"
              value={clientFilter}
              onChange={setClientFilter}
              style={{ width: 200 }}
              aria-label="Filtrar por cliente"
              optionFilterProp="label"
              options={(clients ?? []).map((client) => ({
                value: client.id,
                label: client.name,
              }))}
            />
            <Select
              allowClear
              showSearch
              placeholder="Persona"
              value={memberFilter}
              onChange={setMemberFilter}
              style={{ width: 200 }}
              aria-label="Filtrar por persona"
              optionFilterProp="label"
              options={(members ?? []).map((member) => ({
                value: member.id,
                label: member.name,
              }))}
            />
            <Input.Search
              placeholder="Buscar pendiente..."
              allowClear
              onSearch={setSearch}
              style={{ maxWidth: 260 }}
              aria-label="Buscar pendiente"
            />
          </Flex>
          <Segmented
            options={VIEW_OPTIONS}
            value={view}
            onChange={(value) => changeView(value as TasksView)}
            aria-label="Cambiar vista de pendientes"
          />
        </Flex>

        {isKanban ? (
          <TaskBoard
            tasks={tasks ?? []}
            loading={isLoading}
            onView={(task) => setDetailTaskId(task.id)}
            onAssign={setAssignTask}
            onReassign={setReassignTask}
            onExtend={setExtendTask}
          />
        ) : (
          <TasksTable
            tasks={tasks ?? []}
            loading={isLoading}
            onView={(task) => setDetailTaskId(task.id)}
            onAssign={setAssignTask}
            onReassign={setReassignTask}
            onExtend={setExtendTask}
          />
        )}
      </GlassCard>

      <TaskFormModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <TaskDetailDrawer taskId={detailTaskId} onClose={() => setDetailTaskId(null)} />
      <AssignTaskModal task={assignTask} onClose={() => setAssignTask(null)} />
      <ReassignTaskModal task={reassignTask} onClose={() => setReassignTask(null)} />
      <ExtendTaskModal task={extendTask} onClose={() => setExtendTask(null)} />
    </PageTransition>
  );
}
