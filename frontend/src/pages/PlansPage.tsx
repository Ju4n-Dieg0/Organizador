import { useState } from 'react';
import {
  Button,
  Popconfirm,
  Space,
  Table,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { PageTransition } from '../components/common/PageTransition';
import { PageHeader } from '../components/common/PageHeader';
import { GlassCard } from '../components/common/GlassCard';
import { EmptyState } from '../components/common/EmptyState';
import { PlanFormModal } from '../components/plans/PlanFormModal';
import { useDeletePlan, usePlans } from '../hooks/usePlans';
import type { PlanResponse } from '../types/plan.types';

export function PlansPage() {
  const { data: plans, isLoading } = usePlans();
  const deletePlan = useDeletePlan();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlanResponse | null>(null);

  const openCreate = () => {
    setEditingPlan(null);
    setModalOpen(true);
  };

  const openEdit = (plan: PlanResponse) => {
    setEditingPlan(plan);
    setModalOpen(true);
  };

  const columns: ColumnsType<PlanResponse> = [
    {
      title: 'Nombre',
      dataIndex: 'name',
      key: 'name',
      width: 220,
      render: (name: string) => (
        <Typography.Text style={{ fontWeight: 500 }}>{name}</Typography.Text>
      ),
    },
    {
      title: 'Descripción',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (description: string | null) =>
        description ?? <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: 'Clientes',
      dataIndex: 'clientCount',
      key: 'clientCount',
      width: 100,
      align: 'center',
      className: 'tnum',
    },
    {
      title: 'Acciones',
      key: 'actions',
      width: 120,
      render: (_, plan) => (
        <Space size={2}>
          <Tooltip title="Editar">
            <Button
              type="text"
              icon={<EditOutlined />}
              aria-label={`Editar plan ${plan.name}`}
              onClick={() => openEdit(plan)}
            />
          </Tooltip>
          <Popconfirm
            title="Eliminar plan"
            description={
              plan.clientCount > 0
                ? `Este plan tiene ${plan.clientCount} cliente(s); no podrá eliminarse.`
                : `¿Eliminar el plan ${plan.name}? Esta acción no se puede deshacer.`
            }
            okText="Sí, eliminar"
            cancelText="Cancelar"
            okButtonProps={{ danger: true }}
            onConfirm={() => deletePlan.mutate(plan.id)}
          >
            <Tooltip title="Eliminar">
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                aria-label={`Eliminar plan ${plan.name}`}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <PageTransition>
      <PageHeader
        eyebrow="Catálogo"
        title="Planes"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Nuevo plan
          </Button>
        }
      />

      <GlassCard>
        <Table<PlanResponse>
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={plans}
          loading={isLoading}
          pagination={{ pageSize: 20, showTotal: (total) => `${total} planes` }}
          locale={{
            emptyText: (
              <EmptyState
                description="No hay planes creados"
                actionLabel="Crear plan"
                onAction={openCreate}
              />
            ),
          }}
        />
      </GlassCard>

      <PlanFormModal
        open={modalOpen}
        plan={editingPlan}
        onClose={() => setModalOpen(false)}
      />
    </PageTransition>
  );
}
