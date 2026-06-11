import { useEffect } from 'react';
import { Button, Form, Input, Modal, Select, Space } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useClients } from '../../hooks/useClients';
import { useCreateTask } from '../../hooks/useTasks';
import type { TaskLinkInput } from '../../types/task.types';

interface TaskFormValues {
  clientId: number;
  title: string;
  description?: string;
  links?: { url: string; label?: string }[];
}

interface TaskFormModalProps {
  open: boolean;
  /** Si se indica, el cliente queda fijo (crear desde detalle de cliente). */
  fixedClientId?: number;
  onClose: () => void;
}

/** Modal de creación de pendiente. */
export function TaskFormModal({ open, fixedClientId, onClose }: TaskFormModalProps) {
  const [form] = Form.useForm<TaskFormValues>();
  const { data: clients, isLoading: clientsLoading } = useClients({ status: 'active' });
  const createTask = useCreateTask();

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (fixedClientId !== undefined) {
      form.setFieldsValue({ clientId: fixedClientId });
    }
  }, [open, fixedClientId, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const links: TaskLinkInput[] = (values.links ?? []).map((link) => ({
      url: link.url,
      label: link.label?.trim() ? link.label.trim() : undefined,
    }));
    createTask.mutate(
      {
        clientId: values.clientId,
        title: values.title,
        description: values.description?.trim() ? values.description.trim() : undefined,
        links: links.length > 0 ? links : undefined,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal
      open={open}
      title="Nuevo pendiente"
      okText="Crear pendiente"
      cancelText="Cancelar"
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={createTask.isPending}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" requiredMark="optional">
        <Form.Item
          name="clientId"
          label="Cliente"
          rules={[{ required: true, message: 'Selecciona un cliente' }]}
        >
          <Select
            placeholder="Selecciona un cliente"
            loading={clientsLoading}
            disabled={fixedClientId !== undefined}
            showSearch
            optionFilterProp="label"
            options={(clients ?? []).map((client) => ({
              value: client.id,
              label: client.name,
            }))}
          />
        </Form.Item>
        <Form.Item
          name="title"
          label="Título"
          rules={[{ required: true, message: 'El título es obligatorio' }]}
        >
          <Input placeholder="¿Qué hay que hacer?" maxLength={200} />
        </Form.Item>
        <Form.Item name="description" label="Descripción">
          <Input.TextArea
            placeholder="Detalles del pendiente (opcional)"
            rows={3}
            maxLength={1000}
            showCount
          />
        </Form.Item>
        <Form.Item label="Links">
          <Form.List name="links">
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
                      <Input placeholder="https://..." />
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
                <Button type="dashed" icon={<PlusOutlined />} onClick={() => add()} block>
                  Agregar link
                </Button>
              </Space>
            )}
          </Form.List>
        </Form.Item>
      </Form>
    </Modal>
  );
}
