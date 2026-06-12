import { useEffect } from 'react';
import { Form, Input, Modal } from 'antd';
import { useCreateTeamMember, useUpdateTeamMember } from '../../hooks/useTeam';
import type { TeamMemberResponse } from '../../types/team.types';

interface TeamMemberFormValues {
  name: string;
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
      form.setFieldsValue({ name: member.name });
    } else {
      form.resetFields();
    }
  }, [open, member, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (isEdit) {
      updateMember.mutate(
        { id: member.id, data: { name: values.name } },
        { onSuccess: onClose },
      );
    } else {
      createMember.mutate({ name: values.name }, { onSuccess: onClose });
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
          extra="Para que reciba alertas por Telegram, usa la acción «Vincular Telegram» de la tabla después de crearla."
        >
          <Input placeholder="Nombre de la persona" maxLength={120} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
