import { Flex, Skeleton, Typography } from 'antd';
import { CheckCircleOutlined, RightOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { GlassCard } from '../common/GlassCard';
import { TagPill } from '../common/TagPill';
import { RequestTypeTag } from './RequestTypeTag';
import { usePendingRequests } from '../../hooks/useRequests';
import { formatRelative } from '../../services/date.service';
import { ROUTES } from '../../constants/routes';
import { colors } from '../../theme';

const MAX_ITEMS = 5;

/**
 * Panel del Dashboard «Solicitudes del equipo»: conteo de pendientes,
 * las más recientes (quién + summary) y acceso a la página completa.
 */
export function PendingRequestsPanel() {
  const { data: pending, isLoading } = usePendingRequests();
  const pendingCount = pending?.length ?? 0;
  const recent = (pending ?? []).slice(0, MAX_ITEMS);

  return (
    <GlassCard style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Flex justify="space-between" align="center" gap={8} style={{ marginBottom: 16 }}>
        {/* h2 (sin salto h1→h5); el tamaño visual se conserva con fontSize. */}
        <Typography.Title
          level={2}
          style={{ margin: 0, letterSpacing: '-0.01em', fontSize: 16 }}
        >
          Solicitudes del equipo
        </Typography.Title>
        {pendingCount > 0 && (
          <TagPill color={colors.warning}>
            {pendingCount} pendiente{pendingCount === 1 ? '' : 's'}
          </TagPill>
        )}
      </Flex>

      {isLoading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : pendingCount === 0 ? (
        <Flex
          vertical
          align="center"
          justify="center"
          gap={8}
          style={{ flex: 1, padding: '24px 0', color: colors.textMuted }}
        >
          <CheckCircleOutlined
            style={{ fontSize: 22, color: colors.success }}
            aria-hidden
          />
          <Typography.Text style={{ color: colors.textMuted }}>
            Sin solicitudes pendientes
          </Typography.Text>
        </Flex>
      ) : (
        <Flex vertical gap={0} style={{ flex: 1 }}>
          {recent.map((request, index) => (
            <div
              key={request.id}
              style={{
                padding: '10px 0',
                borderTop: index === 0 ? 'none' : `1px solid ${colors.borderGlass}`,
              }}
            >
              <Flex justify="space-between" align="center" gap={8}>
                <Typography.Text style={{ fontWeight: 600, fontSize: 13 }} ellipsis>
                  {request.requester.name}
                </Typography.Text>
                <Flex align="center" gap={8} style={{ flexShrink: 0 }}>
                  <RequestTypeTag type={request.type} size="sm" />
                  <Typography.Text style={{ fontSize: 12, color: colors.textMuted }}>
                    {formatRelative(request.createdAt)}
                  </Typography.Text>
                </Flex>
              </Flex>
              <Typography.Text
                style={{ fontSize: 13, color: colors.textMuted, display: 'block' }}
                ellipsis
              >
                {request.summary}
              </Typography.Text>
            </div>
          ))}
        </Flex>
      )}

      <Flex justify="flex-end" style={{ marginTop: 12 }}>
        {/* Enlace real (middle-click / abrir en pestaña), no Button+navigate. */}
        <Link to={ROUTES.requests} style={{ fontSize: 13, color: colors.accent }}>
          Ver todas las solicitudes <RightOutlined aria-hidden />
        </Link>
      </Flex>
    </GlassCard>
  );
}
