import { useRef } from 'react';
import { App, Button, Flex, Input, Modal, Space, Typography } from 'antd';
import type { InputRef } from 'antd';
import { CopyOutlined, SendOutlined } from '@ant-design/icons';
import { formatDateTime } from '../../services/date.service';
import { colors } from '../../theme';
import type { TelegramLinkResponse } from '../../types/team.types';

interface TelegramLinkModalProps {
  open: boolean;
  /** Enlace generado; null mientras no haya respuesta. */
  linkData: TelegramLinkResponse | null;
  /** Nombre del miembro al que pertenece el enlace. */
  memberName: string;
  onClose: () => void;
}

/**
 * Modal que muestra el deep link de vinculación de Telegram recién generado,
 * con botón de copiar, apertura directa y nota de expiración (un solo uso).
 */
export function TelegramLinkModal({
  open,
  linkData,
  memberName,
  onClose,
}: TelegramLinkModalProps) {
  const { message } = App.useApp();
  const linkInputRef = useRef<InputRef>(null);

  const handleCopy = async () => {
    if (!linkData) return;
    try {
      await navigator.clipboard.writeText(linkData.link);
      message.success('Enlace copiado al portapapeles');
    } catch {
      linkInputRef.current?.focus({ cursor: 'all' });
      message.info(
        'No se pudo copiar automáticamente: selecciona el enlace y cópialo manualmente',
      );
    }
  };

  return (
    <Modal
      open={open}
      title={`Vincular Telegram — ${memberName}`}
      onCancel={onClose}
      footer={
        <Button type="primary" onClick={onClose}>
          Listo
        </Button>
      }
      destroyOnHidden
    >
      {linkData && (
        <Flex vertical gap={12}>
          <Typography.Paragraph style={{ marginBottom: 0 }}>
            Comparte este enlace con <strong>{memberName}</strong>. Al abrirlo en
            Telegram y pulsar «Iniciar», su chat quedará vinculado y empezará a
            recibir alertas y recordatorios.
          </Typography.Paragraph>

          <Space.Compact style={{ width: '100%' }}>
            <Input
              ref={linkInputRef}
              readOnly
              value={linkData.link}
              aria-label="Enlace de vinculación de Telegram"
              onFocus={(e) => e.target.select()}
            />
            <Button icon={<CopyOutlined />} onClick={handleCopy}>
              Copiar
            </Button>
          </Space.Compact>

          <Button
            icon={<SendOutlined />}
            href={linkData.link}
            target="_blank"
            rel="noopener noreferrer"
            style={{ alignSelf: 'flex-start' }}
          >
            Abrir en Telegram
          </Button>

          <Typography.Text style={{ color: colors.textMuted, fontSize: 12 }}>
            El enlace expira el {formatDateTime(linkData.expiresAt)} y es de un
            solo uso. Si lo regeneras, el anterior deja de funcionar.
          </Typography.Text>
        </Flex>
      )}
    </Modal>
  );
}
