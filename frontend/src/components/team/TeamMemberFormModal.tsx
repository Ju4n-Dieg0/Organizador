import { useEffect } from 'react';
import { Form, Input, Modal } from 'antd';
import { useCreateTeamMember, useUpdateTeamMember } from '../../hooks/useTeam';
import type { TeamMemberResponse } from '../../types/team.types';

interface TeamMemberFormValues {
  name: string;
  telegramChatId?: string;
}

interface TeamMemberFormModalProps {
  open: boolean;
  member: TeamMemberResponse | null;
  onClose: () => void;
}

/** Modal de creación/edición de persona del equipo. */
export function TeamMemberFormModal({ open, member, onClose }: TeamMemberFormModalProps) {
  const [form] = Form.useForm<TeamMemberFormValues>();
  const createMember = useCreateTeamMember();
  const updateMember = useUpdateTeamMember();
  const isEdit = member !== null;
  const isSaving = createMember.isPending || updateMember.isPending;

  useEffect(() => {
    if (!open) return;
    if (member) {
      form.setFieldsValue({
        name: member.name,
        telegramChatId: member.telegramChatId ?? undefined,
      });
    } else {
      form.resetFields();
    }
  }, [open, member, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const chatId = values.telegramChatId?.trim();
    if (isEdit) {
      updateMember.mutate(
        {
          id: member.id,
          data: { name: values.name, telegramChatId: chatId ? chatId : null },
        },
        { onSuccess: onClose },
      );
    } else {
      createMember.mutate(
        { name: values.name, telegramChatId: chatId ? chatId : undefined },
        { onSuccess: onClose },
      );
    }
  };

  return (
    <Modal
      open={open}
      title={isEdit ? 'Editar persona' : 'Nueva persona'}
      okText={isEdit ? 'Guardar cambios' : 'Crear persona'}
      cancelText="Cancelar"
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={isSaving}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" requiredMark="optional">
        <Form.Item
          name="name"
          label="Nombre"
          rules={[{ required: true, message: 'El nombre es obligatorio' }]}
        >
          <Input placeholder="Nombre de la persona" maxLength={120} />
        </Form.Item>
        <Form.Item
          name="telegramChatId"
          label="Chat ID de Telegram"
          extra="Identificador del chat de Telegram donde la persona recibirá alertas de asignaciones, extensiones y recordatorios. Déjalo vacío si no quiere recibir notificaciones."
        >
          <Input placeholder="Ej.: 123456789" maxLength={32} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
