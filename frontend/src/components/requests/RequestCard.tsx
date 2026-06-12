import { useMemo } from 'react';
import { Button, Flex, Popconfirm, Typography } from 'antd';
import { CheckOutlined, CloseOutlined, UserOutlined } from '@ant-design/icons';
import { GlassCard } from '../common/GlassCard';
import { RequestTypeTag } from './RequestTypeTag';
import { useApproveRequest } from '../../hooks/useRequests';
import { getRequestDetails } from '../../services/request.service';
import { formatRelative } from '../../services/date.service';
import { colors } from '../../theme';
import type { TeamRequestResponse } from '../../types/request.types';

interface RequestCardProps {
  request: TeamRequestResponse;
  /** Abre el modal de rechazo (la razón es obligatoria). */
  onReject: (request: TeamRequestResponse) => void;
}

/**
 * Card de una solicitud pendiente: tipo, solicitante, contexto del
 * pendiente/cliente, `summary` del backend como descripción principal,
 * datos propuestos del payload y acciones Aprobar / Rechazar.
 */
export function RequestCard({ request, onReject }: RequestCardProps) {
  const approveRequest = useApproveRequest();
  const details = useMemo(
    () => getRequestDetails(request.payload),
    [request.payload],
  );

  return (
    <GlassCard
      style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <Flex justify="space-between" align="center" gap={8} wrap>
        <RequestTypeTag type={request.type} />
        <Typography.Text style={{ color: colors.textMuted, fontSize: 12 }}>
          {formatRelative(request.createdAt)}
        </Typography.Text>
      </Flex>

      <div>
        <Typography.Text style={{ fontSize: 13, color: colors.textMuted }}>
          <UserOutlined style={{ marginRight: 6 }} aria-hidden />
          Solicita{' '}
          <Typography.Text style={{ fontWeight: 600, fontSize: 13 }}>
            {request.requester.name}
          </Typography.Text>
        </Typography.Text>
        {request.task && (
          <div style={{ marginTop: 2 }}>
            <Typography.Text style={{ fontSize: 13, color: colors.textMuted }}>
              Sobre «{request.task.title}» · {request.task.clientName}
            </Typography.Text>
          </div>
        )}
      </div>

      <Typography.Paragraph
        style={{ margin: 0, fontSize: 14, color: colors.text }}
      >
        {request.summary}
      </Typography.Paragraph>

      {details.length > 0 && (
        <Flex
          vertical
          gap={4}
          style={{
            borderTop: `1px solid ${colors.borderGlass}`,
            paddingTop: 10,
          }}
        >
          {details.map((item) => (
            <Flex key={item.label} gap={8} align="baseline">
              <Typography.Text
                style={{
                  color: colors.textMuted,
                  fontSize: 12,
                  minWidth: 92,
                  flexShrink: 0,
                }}
              >
                {item.label}
              </Typography.Text>
              <Typography.Text style={{ fontSize: 12 }}>
                {item.value}
              </Typography.Text>
            </Flex>
          ))}
        </Flex>
      )}

      <Flex justify="flex-end" gap={8} style={{ marginTop: 'auto' }}>
        <Button
          danger
          icon={<CloseOutlined />}
          onClick={() => onReject(request)}
          disabled={approveRequest.isPending}
          aria-label={`Rechazar solicitud de ${request.requester.name}`}
        >
          Rechazar
        </Button>
        <Popconfirm
          title="Aprobar solicitud"
          description={
            request.type === 'CREAR_PENDIENTE'
              ? 'Se creará el pendiente propuesto.'
              : 'Se ejecutará la operación sobre el pendiente.'
          }
          okText="Sí, aprobar"
          cancelText="Cancelar"
          onConfirm={() => approveRequest.mutate(request.id)}
        >
          <Button
            type="primary"
            icon={<CheckOutlined />}
            loading={approveRequest.isPending}
            aria-label={`Aprobar solicitud de ${request.requester.name}`}
          >
            Aprobar
          </Button>
        </Popconfirm>
      </Flex>
    </GlassCard>
  );
}
