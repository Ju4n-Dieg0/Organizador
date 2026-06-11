import { useEffect } from 'react';
import { DatePicker, Form, Input, Modal, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useExtendTask } from '../../hooks/useTasks';
import { formatDate } from '../../services/date.service';
import type { TaskResponse } from '../../types/task.types';

interface ExtendFormValues {
  newDueDate: Dayjs;
  reason: string;
}

interface ExtendTaskModalProps {
  task: TaskResponse | null;
  onClose: () => void;
}

/** Extender la fecha de entrega: nueva fecha + razón obligatoria. */
export function ExtendTaskModal({ task, onClose }: ExtendTaskModalProps) {
  const [form] = Form.useForm<ExtendFormValues>();
  const extendTask = useExtendTask();
  const open = task !== null;

  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);

  const handleSubmit = async () => {
    if (!task) return;
    const values = await form.validateFields();
    extendTask.mutate(
      {
        id: task.id,
        data: {
          newDueDate: values.newDueDate.toISOString(),
          reason: values.reason.trim(),
        },
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal
      open={open}
      title={task ? `Extender pendiente #${task.id}` : 'Extender pendiente'}
      okText="Extender"
      cancelText="Cancelar"
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={extendTask.isPending}
      destroyOnHidden
    >
      {task?.dueDate && (
        <Typography.Paragraph type="secondary">
          Fecha de entrega actual: {formatDate(task.dueDate)}
        </Typography.Paragraph>
      )}
      <Form form={form} layout="vertical">
        <Form.Item
          name="newDueDate"
          label="Nueva fecha de entrega"
          rules={[{ required: true, message: 'La nueva fecha es obligatoria' }]}
        >
          <DatePicker
            style={{ width: '100%' }}
            format="DD/MM/YYYY"
            disabledDate={(date) => date.isBefore(dayjs().startOf('day'))}
            placeholder="Selecciona la nueva fecha"
          />
        </Form.Item>
        <Form.Item
          name="reason"
          label="Razón de la extensión"
          rules={[{ required: true, message: 'La razón es obligatoria' }]}
        >
          <Input.TextArea
            placeholder="¿Por qué se extiende la fecha de entrega?"
            rows={3}
            maxLength={500}
            showCount
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
