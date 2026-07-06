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
  DisconnectOutlined,
  EditOutlined,
  LinkOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
  UserDeleteOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { PageTransition } from '../components/common/PageTransition';
import { PageHeader } from '../components/common/PageHeader';
import { GlassCard } from '../components/common/GlassCard';
import { EmptyState } from '../components/common/EmptyState';
import { TagPill } from '../components/common/TagPill';
import { TeamMemberFormModal } from '../components/team/TeamMemberFormModal';
import { TelegramLinkModal } from '../components/team/TelegramLinkModal';
import {
  useActivateTeamMember,
  useDeactivateTeamMember,
  useGenerateTelegramLink,
  useSetTeamMemberOwner,
  useTeamMembers,
  useUnlinkTelegram,
} from '../hooks/useTeam';
import { formatDateTime } from '../services/date.service';
import { colors } from '../theme';
import type {
  TeamMemberResponse,
  TeamStatusFilter,
  TelegramLinkResponse,
} from '../types/team.types';

const STATUS_OPTIONS = [
  { label: 'Activos', value: 'active' },
  { label: 'Inactivos', value: 'inactive' },
  { label: 'Todos', value: 'all' },
];

interface LinkModalState {
  data: TelegramLinkResponse;
  memberName: string;
}

/** Estado de vinculación de Telegram de un miembro, como tag semántico. */
function TelegramStatusCell({ member }: { member: TeamMemberResponse }) {
  if (member.telegramLinked) {
    return (
      <TagPill color={colors.success}>
        <CheckCircleOutlined style={{ marginRight: 4 }} aria-hidden />
        Conectado
      </TagPill>
    );
  }
  if (member.telegramLinkPending) {
    return (
      <Flex vertical gap={2} align="flex-start">
        <TagPill color={colors.warning}>
          <LinkOutlined style={{ marginRight: 4 }} aria-hidden />
          Enlace pendiente
        </TagPill>
        <Typography.Text style={{ color: colors.textMuted, fontSize: 12 }}>
          {member.telegramLinkExpiresAt
            ? `Expira el ${formatDateTime(member.telegramLinkExpiresAt)}`
            : 'Enlace sin usar'}
        </Typography.Text>
      </Flex>
    );
  }
  return <TagPill color={colors.textMuted}>Sin vincular</TagPill>;
}

export function TeamPage() {
  const [statusFilter, setStatusFilter] = useState<TeamStatusFilter>('active');
  const { data: members, isLoading } = useTeamMembers(statusFilter);
  const deactivateMember = useDeactivateTeamMember();
  const activateMember = useActivateTeamMember();
  const generateLink = useGenerateTelegramLink();
  const unlinkTelegram = useUnlinkTelegram();
  const setOwner = useSetTeamMemberOwner();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMemberResponse | null>(null);
  const [linkModal, setLinkModal] = useState<LinkModalState | null>(null);

  const openCreate = () => {
    setEditingMember(null);
    setModalOpen(true);
  };

  const openEdit = (member: TeamMemberResponse) => {
    setEditingMember(member);
    setModalOpen(true);
  };

  const handleGenerateLink = (member: TeamMemberResponse) => {
    generateLink.mutate(member.id, {
      onSuccess: (data) => setLinkModal({ data, memberName: member.name }),
    });
  };

  const columns: ColumnsType<TeamMemberResponse> = [
    {
      title: 'Nombre',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (name: string, member) => (
        <Space size={8}>
          <Typography.Text style={{ fontWeight: 500 }}>{name}</Typography.Text>
          {member.isOwner && (
            <TagPill color={colors.accent} size="sm">
              <UserOutlined style={{ marginRight: 4 }} aria-hidden />
              Tú
            </TagPill>
          )}
        </Space>
      ),
    },
    {
      title: 'Telegram',
      key: 'telegram',
      width: 180,
      render: (_, member) => <TelegramStatusCell member={member} />,
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
      width: 210,
      render: (_, member) => {
        const isGeneratingThis =
          generateLink.isPending && generateLink.variables === member.id;
        const isSettingOwnerThis =
          setOwner.isPending && setOwner.variables?.id === member.id;
        return (
          <Space size={2}>
            <Tooltip title="Editar">
              <Button
                type="text"
                icon={<EditOutlined />}
                aria-label={`Editar a ${member.name}`}
                onClick={() => openEdit(member)}
              />
            </Tooltip>
            {member.isOwner ? (
              <Popconfirm
                title="No soy yo"
                description={`¿Quitar la marca «Tú» de ${member.name}?`}
                okText="Sí, quitar"
                cancelText="Cancelar"
                onConfirm={() => setOwner.mutate({ id: member.id, isOwner: false })}
              >
                <Tooltip title="No soy yo">
                  <Button
                    type="text"
                    icon={<UserDeleteOutlined />}
                    loading={isSettingOwnerThis}
                    aria-label={`Quitar la marca de dueño a ${member.name}`}
                  />
                </Tooltip>
              </Popconfirm>
            ) : (
              <Popconfirm
                title="Este soy yo"
                description={`¿Marcar a ${member.name} como tú? Si otra persona estaba marcada, dejará de estarlo.`}
                okText="Sí, soy yo"
                cancelText="Cancelar"
                onConfirm={() => setOwner.mutate({ id: member.id, isOwner: true })}
              >
                <Tooltip title="Este soy yo">
                  <Button
                    type="text"
                    icon={<UserOutlined />}
                    loading={isSettingOwnerThis}
                    aria-label={`Marcar a ${member.name} como dueño`}
                  />
                </Tooltip>
              </Popconfirm>
            )}
            {member.telegramLinked ? (
              <Popconfirm
                title="Desvincular Telegram"
                description={`¿Desvincular el Telegram de ${member.name}? Dejará de recibir alertas y recordatorios.`}
                okText="Sí, desvincular"
                cancelText="Cancelar"
                okButtonProps={{ danger: true }}
                onConfirm={() => unlinkTelegram.mutate(member.id)}
              >
                <Tooltip title="Desvincular Telegram">
                  <Button
                    type="text"
                    danger
                    icon={<DisconnectOutlined />}
                    loading={unlinkTelegram.isPending && unlinkTelegram.variables === member.id}
                    aria-label={`Desvincular Telegram de ${member.name}`}
                  />
                </Tooltip>
              </Popconfirm>
            ) : member.telegramLinkPending ? (
              <Popconfirm
                title="Regenerar enlace"
                description="¿Regenerar el enlace? El anterior dejará de funcionar."
                okText="Sí, regenerar"
                cancelText="Cancelar"
                okButtonProps={{ danger: true }}
                onConfirm={() => handleGenerateLink(member)}
              >
                <Tooltip title="Regenerar enlace">
                  <Button
                    type="text"
                    icon={<ReloadOutlined />}
                    loading={isGeneratingThis}
                    aria-label={`Regenerar enlace de Telegram para ${member.name}`}
                  />
                </Tooltip>
              </Popconfirm>
            ) : (
              <Tooltip title="Vincular Telegram">
                <Button
                  type="text"
                  icon={<LinkOutlined />}
                  loading={isGeneratingThis}
                  aria-label={`Vincular Telegram de ${member.name}`}
                  onClick={() => handleGenerateLink(member)}
                />
              </Tooltip>
            )}
            {member.active ? (
              <Popconfirm
                title="Desactivar persona"
                description={`¿Desactivar a ${member.name}? Dejará de aparecer en las asignaciones.`}
                okText="Sí, desactivar"
                cancelText="Cancelar"
                okButtonProps={{ danger: true }}
                onConfirm={() => deactivateMember.mutate(member.id)}
              >
                <Tooltip title="Desactivar">
                  <Button
                    type="text"
                    danger
                    icon={<StopOutlined />}
                    loading={deactivateMember.isPending && deactivateMember.variables === member.id}
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
                    loading={activateMember.isPending && activateMember.variables === member.id}
                    aria-label={`Reactivar a ${member.name}`}
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
          scroll={{ x: 800 }}
        />
      </GlassCard>

      <TeamMemberFormModal
        open={modalOpen}
        member={editingMember}
        onClose={() => setModalOpen(false)}
      />

      <TelegramLinkModal
        open={linkModal !== null}
        linkData={linkModal?.data ?? null}
        memberName={linkModal?.memberName ?? ''}
        onClose={() => setLinkModal(null)}
      />
    </PageTransition>
  );
}
