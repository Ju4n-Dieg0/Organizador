import { useState } from 'react';
import {
  Button,
  Flex,
  Input,
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
import { Link } from 'react-router-dom';
import { PageTransition } from '../components/common/PageTransition';
import { PageHeader } from '../components/common/PageHeader';
import { GlassCard } from '../components/common/GlassCard';
import { EmptyState } from '../components/common/EmptyState';
import { LinksList } from '../components/common/LinksList';
import { TagPill } from '../components/common/TagPill';
import { ClientFormModal } from '../components/clients/ClientFormModal';
import {
  useActivateClient,
  useClients,
  useDeactivateClient,
} from '../hooks/useClients';
import { clientDetailPath } from '../constants/routes';
import { colors } from '../theme';
import type { ClientResponse, ClientStatusFilter } from '../types/client.types';

const STATUS_OPTIONS = [
  { label: 'Activos', value: 'active' },
  { label: 'Inactivos', value: 'inactive' },
  { label: 'Todos', value: 'all' },
];

export function ClientsPage() {
  const [statusFilter, setStatusFilter] = useState<ClientStatusFilter>('active');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientResponse | null>(null);

  const { data: clients, isLoading } = useClients({
    status: statusFilter,
    search,
  });
  const deactivateClient = useDeactivateClient();
  const activateClient = useActivateClient();

  const openCreate = () => {
    setEditingClient(null);
    setModalOpen(true);
  };

  const openEdit = (client: ClientResponse) => {
    setEditingClient(client);
    setModalOpen(true);
  };

  const columns: ColumnsType<ClientResponse> = [
    {
      title: 'Nombre',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (name: string, client) => (
        <Link to={clientDetailPath(client.id)} style={{ fontWeight: 500 }}>
          {name}
        </Link>
      ),
    },
    {
      title: 'Plan',
      key: 'plan',
      width: 150,
      render: (_, client) =>
        client.plan ? (
          client.plan.name
        ) : (
          <Typography.Text type="secondary">Sin plan</Typography.Text>
        ),
    },
    {
      title: 'Drive',
      key: 'driveLinks',
      width: 110,
      render: (_, client) => <LinksList links={client.driveLinks} mode="compact" />,
    },
    {
      title: 'Pendientes abiertos',
      dataIndex: 'openTaskCount',
      key: 'openTaskCount',
      width: 160,
      align: 'center',
      className: 'tnum',
    },
    {
      title: 'Estado',
      key: 'active',
      width: 110,
      render: (_, client) =>
        client.active ? (
          <TagPill color={colors.success}>Activo</TagPill>
        ) : (
          <TagPill color={colors.textMuted}>Inactivo</TagPill>
        ),
    },
    {
      title: 'Acciones',
      key: 'actions',
      width: 130,
      render: (_, client) => (
        <Space size={2}>
          <Tooltip title="Editar">
            <Button
              type="text"
              icon={<EditOutlined />}
              aria-label={`Editar cliente ${client.name}`}
              onClick={() => openEdit(client)}
            />
          </Tooltip>
          {client.active ? (
            <Popconfirm
              title="Desactivar cliente"
              description={`¿Desactivar a ${client.name}? Podrás reactivarlo cuando quieras.`}
              okText="Sí, desactivar"
              cancelText="Cancelar"
              onConfirm={() => deactivateClient.mutate(client.id)}
            >
              <Tooltip title="Desactivar">
                <Button
                  type="text"
                  danger
                  icon={<StopOutlined />}
                  aria-label={`Desactivar cliente ${client.name}`}
                />
              </Tooltip>
            </Popconfirm>
          ) : (
            <Popconfirm
              title="Reactivar cliente"
              description={`¿Reactivar a ${client.name}?`}
              okText="Sí, reactivar"
              cancelText="Cancelar"
              onConfirm={() => activateClient.mutate(client.id)}
            >
              <Tooltip title="Reactivar">
                <Button
                  type="text"
                  icon={<CheckCircleOutlined />}
                  aria-label={`Reactivar cliente ${client.name}`}
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
        eyebrow="Cartera"
        title="Clientes"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Nuevo cliente
          </Button>
        }
      />

      <GlassCard>
        <Flex gap={12} wrap style={{ marginBottom: 16 }}>
          <Segmented
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(value) => setStatusFilter(value as ClientStatusFilter)}
            aria-label="Filtrar por estado"
          />
          <Input.Search
            placeholder="Buscar cliente..."
            allowClear
            onSearch={setSearch}
            style={{ maxWidth: 280 }}
            aria-label="Buscar cliente"
          />
        </Flex>

        <Table<ClientResponse>
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={clients}
          loading={isLoading}
          pagination={{ pageSize: 20, showTotal: (total) => `${total} clientes` }}
          locale={{
            emptyText: (
              <EmptyState
                description="No hay clientes para mostrar"
                actionLabel="Crear cliente"
                onAction={openCreate}
              />
            ),
          }}
          scroll={{ x: 800 }}
        />
      </GlassCard>

      <ClientFormModal
        open={modalOpen}
        client={editingClient}
        onClose={() => setModalOpen(false)}
      />
    </PageTransition>
  );
}
