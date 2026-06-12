import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Col, Flex, Row, Segmented, Skeleton, Table, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { PageTransition } from '../components/common/PageTransition';
import { PageHeader } from '../components/common/PageHeader';
import { GlassCard } from '../components/common/GlassCard';
import { EmptyState } from '../components/common/EmptyState';
import { TagPill } from '../components/common/TagPill';
import { RequestCard } from '../components/requests/RequestCard';
import { RequestTypeTag } from '../components/requests/RequestTypeTag';
import { RequestStatusTag } from '../components/requests/RequestStatusTag';
import { RejectRequestModal } from '../components/requests/RejectRequestModal';
import { usePendingRequests, useRequests } from '../hooks/useRequests';
import { formatDateTime } from '../services/date.service';
import { colors, motionTokens } from '../theme';
import type {
  TeamRequestResponse,
  TeamRequestStatus,
} from '../types/request.types';

type HistoryFilter = 'all' | Extract<TeamRequestStatus, 'APROBADA' | 'RECHAZADA'>;

const HISTORY_OPTIONS: { label: string; value: HistoryFilter }[] = [
  { label: 'Todas', value: 'all' },
  { label: 'Aprobadas', value: 'APROBADA' },
  { label: 'Rechazadas', value: 'RECHAZADA' },
];

/** Título de sección dentro de la página (h2 visual 16px como en Dashboard). */
function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Typography.Title
      level={2}
      style={{ marginTop: 0, marginBottom: 16, letterSpacing: '-0.01em', fontSize: 16 }}
    >
      {children}
    </Typography.Title>
  );
}

export function RequestsPage() {
  const reducedMotion = useReducedMotion();
  const { data: pending, isLoading: pendingLoading } = usePendingRequests();
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const { data: historyData, isLoading: historyLoading } =
    useRequests(historyFilter);
  const [rejecting, setRejecting] = useState<TeamRequestResponse | null>(null);

  // Con 'all' el backend incluye también las PENDIENTES: el historial
  // muestra solo las resueltas.
  const resolved = useMemo(
    () => (historyData ?? []).filter((req) => req.status !== 'PENDIENTE'),
    [historyData],
  );

  const pendingCount = pending?.length ?? 0;

  const historyColumns: ColumnsType<TeamRequestResponse> = [
    {
      title: 'Tipo',
      key: 'type',
      width: 150,
      render: (_, req) => <RequestTypeTag type={req.type} size="sm" />,
    },
    {
      title: 'Solicitante',
      key: 'requester',
      width: 150,
      ellipsis: true,
      render: (_, req) => req.requester.name,
    },
    {
      title: 'Solicitud',
      key: 'summary',
      ellipsis: true,
      render: (_, req) => (
        <Tooltip title={req.summary}>
          {/* tabIndex: el texto truncado debe ser alcanzable por teclado
              para que el Tooltip se muestre también con focus. */}
          <Typography.Text tabIndex={0}>{req.summary}</Typography.Text>
        </Tooltip>
      ),
    },
    {
      title: 'Estado',
      key: 'status',
      width: 120,
      render: (_, req) => <RequestStatusTag status={req.status} size="sm" />,
    },
    {
      title: 'Resolución',
      key: 'resolution',
      width: 220,
      render: (_, req) => (
        <Flex vertical gap={0}>
          <Typography.Text>{req.resolvedBy ?? '—'}</Typography.Text>
          <Typography.Text style={{ color: colors.textMuted }}>
            {formatDateTime(req.resolvedAt)}
          </Typography.Text>
        </Flex>
      ),
    },
    {
      title: 'Razón de rechazo',
      key: 'rejectionReason',
      width: 220,
      ellipsis: true,
      render: (_, req) =>
        req.rejectionReason ? (
          <Tooltip title={req.rejectionReason}>
            <Typography.Text tabIndex={0}>{req.rejectionReason}</Typography.Text>
          </Tooltip>
        ) : (
          <Typography.Text style={{ color: colors.textMuted }}>—</Typography.Text>
        ),
    },
  ];

  return (
    <PageTransition>
      <PageHeader
        eyebrow="Equipo"
        title="Solicitudes"
        titleExtra={
          pendingCount > 0 ? (
            <TagPill color={colors.warning}>
              {pendingCount} pendiente{pendingCount === 1 ? '' : 's'}
            </TagPill>
          ) : undefined
        }
      />

      <SectionTitle>Pendientes de aprobación</SectionTitle>
      {pendingLoading ? (
        <Row gutter={[16, 16]}>
          {[0, 1, 2].map((i) => (
            <Col key={i} xs={24} lg={12} xl={8}>
              <GlassCard>
                <Skeleton active paragraph={{ rows: 3 }} />
              </GlassCard>
            </Col>
          ))}
        </Row>
      ) : pendingCount === 0 ? (
        <GlassCard>
          <EmptyState description="No hay solicitudes pendientes. Las nuevas solicitudes del equipo llegan desde Telegram." />
        </GlassCard>
      ) : (
        <Row gutter={[16, 16]}>
          {/* AnimatePresence: al aprobar/rechazar la card sale con fade
              en vez de desaparecer de golpe. */}
          <AnimatePresence>
            {(pending ?? []).map((request, index) => (
              <Col key={request.id} xs={24} lg={12} xl={8}>
                <motion.div
                  initial={reducedMotion ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{
                    opacity: 0,
                    transition: { duration: reducedMotion ? 0 : motionTokens.exit },
                  }}
                  transition={{
                    duration: motionTokens.enter,
                    ease: motionTokens.ease,
                    delay: reducedMotion ? 0 : index * motionTokens.stagger,
                  }}
                  style={{ height: '100%' }}
                >
                  <RequestCard request={request} onReject={setRejecting} />
                </motion.div>
              </Col>
            ))}
          </AnimatePresence>
        </Row>
      )}

      <GlassCard style={{ marginTop: 24 }}>
        <Flex justify="space-between" align="center" wrap gap={12}>
          <SectionTitle>Historial</SectionTitle>
          <Segmented
            options={HISTORY_OPTIONS}
            value={historyFilter}
            onChange={(value) => setHistoryFilter(value as HistoryFilter)}
            aria-label="Filtrar historial por estado"
            style={{ marginBottom: 16 }}
          />
        </Flex>
        <Table<TeamRequestResponse>
          rowKey="id"
          size="small"
          columns={historyColumns}
          dataSource={resolved}
          loading={historyLoading}
          pagination={{ pageSize: 10, showTotal: (total) => `${total} solicitudes` }}
          locale={{
            emptyText: (
              <EmptyState description="Todavía no hay solicitudes resueltas" />
            ),
          }}
          scroll={{ x: 980 }}
        />
      </GlassCard>

      <RejectRequestModal request={rejecting} onClose={() => setRejecting(null)} />
    </PageTransition>
  );
}
