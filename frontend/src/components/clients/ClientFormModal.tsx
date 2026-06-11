import { useEffect } from 'react';
import { Button, Form, Input, Modal, Select, Space } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { usePlans } from '../../hooks/usePlans';
import { useCreateClient, useUpdateClient } from '../../hooks/useClients';
import type { ClientResponse, DriveLinkInput } from '../../types/client.types';

interface ClientFormValues {
  name: string;
  planId?: number | null;
  driveLinks?: { url: string; label?: string }[];
}

interface ClientFormModalProps {
  open: boolean;
  client: ClientResponse | null;
  onClose: () => void;
}

/** Modal de creación/edición de cliente con lista dinámica de links de Drive. */
export function ClientFormModal({ open, client, onClose }: ClientFormModalProps) {
  const [form] = Form.useForm<ClientFormValues>();
  const { data: plans, isLoading: plansLoading } = usePlans();
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const isEdit = client !== null;
  const isSaving = createClient.isPending || updateClient.isPending;

  useEffect(() => {
    if (!open) return;
    if (client) {
      form.setFieldsValue({
        name: client.name,
        planId: client.plan?.id ?? null,
        driveLinks: client.driveLinks.map((link) => ({
          url: link.url,
          label: link.label ?? undefined,
        })),
      });
    } else {
      form.resetFields();
    }
  }, [open, client, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const driveLinks: DriveLinkInput[] = (values.driveLinks ?? []).map((link) => ({
      url: link.url,
      label: link.label?.trim() ? link.label.trim() : undefined,
    }));

    if (isEdit) {
      updateClient.mutate(
        {
          id: client.id,
          data: {
            name: values.name,
            planId: values.planId ?? null,
            driveLinks,
          },
        },
        { onSuccess: onClose },
      );
    } else {
      createClient.mutate(
        {
          name: values.name,
          planId: values.planId ?? undefined,
          driveLinks,
        },
        { onSuccess: onClose },
      );
    }
  };

  return (
    <Modal
      open={open}
      title={isEdit ? 'Editar cliente' : 'Nuevo cliente'}
      okText={isEdit ? 'Guardar cambios' : 'Crear cliente'}
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
          <Input placeholder="Nombre del cliente" maxLength={120} />
        </Form.Item>
        <Form.Item name="planId" label="Plan">
          <Select
            allowClear
            placeholder="Sin plan"
            loading={plansLoading}
            options={(plans ?? []).map((plan) => ({
              value: plan.id,
              label: plan.name,
            }))}
          />
        </Form.Item>
        <Form.Item label="Links de Drive">
          <Form.List name="driveLinks">
            {(fields, { add, remove }) => (
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                {fields.map(({ key, name, ...restField }) => (
                  <Space key={key} align="start" style={{ width: '100%' }}>
                    <Form.Item
                      {...restField}
                      name={[name, 'url']}
                      rules={[
                        { required: true, message: 'La URL es obligatoria' },
                        { type: 'url', message: 'Debe ser una URL válida' },
                      ]}
                      style={{ marginBottom: 0, width: 240 }}
                    >
                      <Input placeholder="https://drive.google.com/..." />
                    </Form.Item>
                    <Form.Item
                      {...restField}
                      name={[name, 'label']}
                      style={{ marginBottom: 0, width: 140 }}
                    >
                      <Input placeholder="Etiqueta (opcional)" maxLength={60} />
                    </Form.Item>
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      aria-label="Quitar link"
                      onClick={() => remove(name)}
                    />
                  </Space>
                ))}
                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={() => add()}
                  block
                >
                  Agregar link de Drive
                </Button>
              </Space>
            )}
          </Form.List>
        </Form.Item>
      </Form>
    </Modal>
  );
}
