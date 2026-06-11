import { useState } from 'react';
import {
  Button,
  Flex,
  Popconfirm,
  Segmented,
  Space,
  Table,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckCircleOutlined,
  EditOutlined,
  PlusOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { PageTransition } from '../components/common/PageTransition';
import { PageHeader } from '../components/common/PageHeader';
import { GlassCard } from '../components/common/GlassCard';
import { EmptyState } from '../components/common/EmptyState';
import { TagPill } from '../components/common/TagPill';
import { TeamMemberFormModal } from '../components/team/TeamMemberFormModal';
import {
  useActivateTeamMember,
  useDeactivateTeamMember,
  useTeamMembers,
} from '../hooks/useTeam';
import { colors } from '../theme';
import type { TeamMemberResponse, TeamStatusFilter } from '../types/team.types';

const STATUS_OPTIONS = [
  { label: 'Activos', value: 'active' },
  { label: 'Inactivos', value: 'inactive' },
  { label: 'Todos', value: 'all' },
];

export function TeamPage() {
  const [statusFilter, setStatusFilter] = useState<TeamStatusFilter>('active');
  const { data: members, isLoading } = useTeamMembers(statusFilter);
  const deactivateMember = useDeactivateTeamMember();
  const activateMember = useActivateTeamMember();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMemberResponse | null>(null);

  const openCreate = () => {
    setEditingMember(null);
    setModalOpen(true);
  };

  const openEdit = (member: TeamMemberResponse) => {
    setEditingMember(member);
    setModalOpen(true);
  };

  const columns: ColumnsType<TeamMemberResponse> = [
    {
      title: 'Nombre',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (name: string) => (
        <Typography.Text style={{ fontWeight: 500 }}>{name}</Typography.Text>
      ),
    },
    {
      title: 'Chat ID de Telegram',
      dataIndex: 'telegramChatId',
      key: 'telegramChatId',
      width: 200,
      render: (chatId: string | null) =>
        chatId ? (
          <Typography.Text className="tnum" style={{ color: colors.textMuted }}>
            {chatId}
          </Typography.Text>
        ) : (
          <Typography.Text type="secondary">Sin configurar</Typography.Text>
        ),
    },
    {
      title: 'Tareas activas',
      dataIndex: 'activeTaskCount',
      key: 'activeTaskCount',
      width: 130,
      align: 'center',
      className: 'tnum',
    },
    {
      title: 'Estado',
      key: 'active',
      width: 110,
      render: (_, member) =>
        member.active ? (
          <TagPill color={colors.success}>Activo</TagPill>
        ) : (
          <TagPill color={colors.textMuted}>Inactivo</TagPill>
        ),
    },
    {
      title: 'Acciones',
      key: 'actions',
      width: 130,
      render: (_, member) => (
        <Space size={2}>
          <Tooltip title="Editar">
            <Button
              type="text"
              icon={<EditOutlined />}
              aria-label={`Editar a ${member.name}`}
              onClick={() => openEdit(member)}
            />
          </Tooltip>
          {member.active ? (
            <Popconfirm
              title="Desactivar persona"
              description={`¿Desactivar a ${member.name}? Dejará de aparecer en las asignaciones.`}
              okText="Sí, desactivar"
              cancelText="Cancelar"
              onConfirm={() => deactivateMember.mutate(member.id)}
            >
              <Tooltip title="Desactivar">
                <Button
                  type="text"
                  danger
                  icon={<StopOutlined />}
                  aria-label={`Desactivar a ${member.name}`}
                />
              </Tooltip>
            </Popconfirm>
          ) : (
            <Popconfirm
              title="Reactivar persona"
              description={`¿Reactivar a ${member.name}?`}
              okText="Sí, reactivar"
              cancelText="Cancelar"
              onConfirm={() => activateMember.mutate(member.id)}
            >
              <Tooltip title="Reactivar">
                <Button
                  type="text"
                  icon={<CheckCircleOutlined />}
                  aria-label={`Reactivar a ${member.name}`}
                />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <PageTransition>
      <PageHeader
        eyebrow="Personas"
        title="Equipo"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Nueva persona
          </Button>
        }
      />

      <GlassCard>
        <Flex style={{ marginBottom: 16 }}>
          <Segmented
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(value) => setStatusFilter(value as TeamStatusFilter)}
            aria-label="Filtrar por estado"
          />
        </Flex>

        <Table<TeamMemberResponse>
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={members}
          loading={isLoading}
          pagination={{ pageSize: 20, showTotal: (total) => `${total} personas` }}
          locale={{
            emptyText: (
              <EmptyState
                description="No hay personas en el equipo"
                actionLabel="Agregar persona"
                onAction={openCreate}
              />
            ),
          }}
          scroll={{ x: 700 }}
        />
      </GlassCard>

      <TeamMemberFormModal
        open={modalOpen}
        member={editingMember}
        onClose={() => setModalOpen(false)}
      />
    </PageTransition>
  );
}
