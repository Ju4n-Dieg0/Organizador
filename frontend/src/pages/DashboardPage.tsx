import { useMemo, useState } from 'react';
import { Col, Row, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CalendarOutlined,
  ClockCircleOutlined,
  FireOutlined,
  InboxOutlined,
  TeamOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons';
import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { PageTransition } from '../components/common/PageTransition';
import { PageHeader } from '../components/common/PageHeader';
import { GlassCard } from '../components/common/GlassCard';
import { KpiCard } from '../components/common/KpiCard';
import { StatusTag } from '../components/common/StatusTag';
import { DueDateCell } from '../components/tasks/DueDateCell';
import { TaskDetailDrawer } from '../components/tasks/TaskDetailDrawer';
import { useClients } from '../hooks/useClients';
import { useTasks } from '../hooks/useTasks';
import {
  countTasksByStatus,
  getDueSummary,
  getUpcomingDeliveries,
} from '../services/task.service';
import { isOverdue } from '../services/date.service';
import { TASK_STATUS_LABELS } from '../constants/taskStatus';
import { clientDetailPath } from '../constants/routes';
import { colors, motionTokens, withAlpha } from '../theme';
import type { TaskResponse } from '../types/task.types';

export function DashboardPage() {
  const { data: clients, isLoading: clientsLoading } = useClients({ status: 'active' });
  const { data: tasks, isLoading: tasksLoading } = useTasks();
  const reducedMotion = useReducedMotion();
  const [detailTaskId, setDetailTaskId] = useState<number | null>(null);

  const statusCounts = useMemo(() => countTasksByStatus(tasks ?? []), [tasks]);
  const dueSummary = useMemo(() => getDueSummary(tasks ?? []), [tasks]);
  const upcoming = useMemo(() => getUpcomingDeliveries(tasks ?? []), [tasks]);

  const kpis = [
    {
      key: 'clients',
      label: 'Clientes activos',
      value: clients?.length ?? 0,
      valueColor: colors.text,
      icon: <TeamOutlined />,
      loading: clientsLoading,
    },
    {
      key: 'pendiente',
      label: `${TASK_STATUS_LABELS.PENDIENTE}s`,
      value: statusCounts.PENDIENTE,
      valueColor: colors.text,
      icon: <InboxOutlined />,
      loading: tasksLoading,
    },
    {
      key: 'asignado',
      label: `${TASK_STATUS_LABELS.ASIGNADO}s`,
      value: statusCounts.ASIGNADO,
      valueColor: colors.info,
      icon: <UserSwitchOutlined />,
      loading: tasksLoading,
    },
    {
      key: 'extendido',
      label: `${TASK_STATUS_LABELS.EXTENDIDO}s`,
      value: statusCounts.EXTENDIDO,
      valueColor: colors.warning,
      icon: <ClockCircleOutlined />,
      loading: tasksLoading,
    },
    {
      key: 'vencidas',
      label: 'Entregas vencidas',
      value: dueSummary.overdue,
      valueColor: dueSummary.overdue > 0 ? colors.error : colors.text,
      icon: <FireOutlined />,
      loading: tasksLoading,
    },
    {
      key: 'hoy',
      label: 'Entregas de hoy',
      value: dueSummary.dueToday,
      valueColor: dueSummary.dueToday > 0 ? colors.success : colors.text,
      icon: <CalendarOutlined />,
      loading: tasksLoading,
    },
  ];

  const columns: ColumnsType<TaskResponse> = [
    {
      title: 'Pendiente',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (title: string, task) => (
        <Typography.Link onClick={() => setDetailTaskId(task.id)}>
          {title}
        </Typography.Link>
      ),
    },
    {
      title: 'Cliente',
      key: 'client',
      width: 180,
      ellipsis: true,
      render: (_, task) => (
        <Link to={clientDetailPath(task.client.id)}>{task.client.name}</Link>
      ),
    },
    {
      title: 'Estado',
      key: 'status',
      width: 120,
      render: (_, task) => <StatusTag status={task.status} />,
    },
    {
      title: 'Entrega',
      key: 'dueDate',
      width: 210,
      render: (_, task) => <DueDateCell dueDate={task.dueDate} status={task.status} />,
    },
  ];

  return (
    <PageTransition>
      <PageHeader eyebrow="Resumen general" title="Dashboard" />

      <Row gutter={[16, 16]}>
        {kpis.map((kpi, index) => (
          <Col key={kpi.key} xs={12} sm={8} xl={4}>
            <motion.div
              initial={reducedMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: motionTokens.enter,
                ease: motionTokens.ease,
                delay: reducedMotion ? 0 : index * motionTokens.stagger,
              }}
              style={{ height: '100%' }}
            >
              <KpiCard
                label={kpi.label}
                value={kpi.value}
                valueColor={kpi.valueColor}
                icon={kpi.icon}
                loading={kpi.loading}
              />
            </motion.div>
          </Col>
        ))}
      </Row>

      <GlassCard style={{ marginTop: 24 }}>
        {/* h2 (sin salto h1→h5); el tamaño visual se conserva con fontSize. */}
        <Typography.Title
          level={2}
          style={{ marginTop: 0, marginBottom: 16, letterSpacing: '-0.01em', fontSize: 16 }}
        >
          Próximas entregas
        </Typography.Title>
        <Table<TaskResponse>
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={upcoming}
          loading={tasksLoading}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          locale={{ emptyText: 'No hay entregas próximas' }}
          scroll={{ x: 720 }}
          onRow={(task) => ({
            style: isOverdue(task.dueDate)
              ? { background: withAlpha(colors.error, 0.06) }
              : undefined,
          })}
        />
      </GlassCard>

      <TaskDetailDrawer taskId={detailTaskId} onClose={() => setDetailTaskId(null)} />
    </PageTransition>
  );
}
