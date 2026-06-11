import { useEffect } from 'react';
import { Form, Input, Modal } from 'antd';
import { useCreatePlan, useUpdatePlan } from '../../hooks/usePlans';
import type { PlanResponse } from '../../types/plan.types';

interface PlanFormValues {
  name: string;
  description?: string;
}

interface PlanFormModalProps {
  open: boolean;
  plan: PlanResponse | null;
  onClose: () => void;
}

/** Modal de creación/edición de plan. */
export function PlanFormModal({ open, plan, onClose }: PlanFormModalProps) {
  const [form] = Form.useForm<PlanFormValues>();
  const createPlan = useCreatePlan();
  const updatePlan = useUpdatePlan();
  const isEdit = plan !== null;
  const isSaving = createPlan.isPending || updatePlan.isPending;

  useEffect(() => {
    if (!open) return;
    if (plan) {
      form.setFieldsValue({
        name: plan.name,
        description: plan.description ?? undefined,
      });
    } else {
      form.resetFields();
    }
  }, [open, plan, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const payload = {
      name: values.name,
      description: values.description?.trim() ? values.description.trim() : undefined,
    };
    if (isEdit) {
      updatePlan.mutate({ id: plan.id, data: payload }, { onSuccess: onClose });
    } else {
      createPlan.mutate(payload, { onSuccess: onClose });
    }
  };

  return (
    <Modal
      open={open}
      title={isEdit ? 'Editar plan' : 'Nuevo plan'}
      okText={isEdit ? 'Guardar cambios' : 'Crear plan'}
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
          <Input placeholder="Nombre del plan" maxLength={120} />
        </Form.Item>
        <Form.Item name="description" label="Descripción">
          <Input.TextArea
            placeholder="Descripción del plan (opcional)"
            rows={3}
            maxLength={500}
            showCount
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
