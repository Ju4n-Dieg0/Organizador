import { useEffect } from 'react';
import { Form, Input, Modal, Typography } from 'antd';
import { useRejectRequest } from '../../hooks/useRequests';
import { isRequestAlreadyResolved } from '../../services/request.service';
import type { TeamRequestResponse } from '../../types/request.types';

interface RejectFormValues {
  reason: string;
}

interface RejectRequestModalProps {
  request: TeamRequestResponse | null;
  onClose: () => void;
}

/**
 * Rechazo de una solicitud: la razón es OBLIGATORIA (el solicitante la
 * recibe por Telegram). Si la solicitud ya fue resuelta en otro lado (409),
 * el hook avisa e invalida, y el modal se cierra.
 */
export function RejectRequestModal({ request, onClose }: RejectRequestModalProps) {
  const [form] = Form.useForm<RejectFormValues>();
  const rejectRequest = useRejectRequest();
  const open = request !== null;

  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);

  const handleSubmit = async () => {
    if (!request) return;
    let values: RejectFormValues;
    try {
      values = await form.validateFields();
    } catch {
      // Validación fallida: AntD ya muestra el error bajo el campo.
      return;
    }
    rejectRequest.mutate(
      { id: request.id, data: { reason: values.reason.trim() } },
      {
        onSuccess: onClose,
        onError: (error) => {
          // Ya resuelta desde Telegram: el hook avisa e invalida; cerramos.
          if (isRequestAlreadyResolved(error)) onClose();
        },
      },
    );
  };

  return (
    <Modal
      open={open}
      title="Rechazar solicitud"
      okText="Rechazar"
      cancelText="Cancelar"
      okButtonProps={{ danger: true }}
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={rejectRequest.isPending}
      destroyOnHidden
    >
      {request && (
        <Typography.Paragraph type="secondary">
          {request.requester.name} solicitó: {request.summary}
        </Typography.Paragraph>
      )}
      <Form form={form} layout="vertical">
        <Form.Item
          name="reason"
          label="Razón del rechazo"
          rules={[
            { required: true, whitespace: true, message: 'La razón es obligatoria' },
          ]}
        >
          <Input.TextArea
            autoFocus
            placeholder="¿Por qué se rechaza? El solicitante la recibirá por Telegram."
            rows={3}
            maxLength={500}
            showCount
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
