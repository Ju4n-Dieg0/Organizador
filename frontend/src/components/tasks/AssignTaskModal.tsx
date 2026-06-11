import { useEffect } from 'react';
import { DatePicker, Form, Modal, Select } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useTeamMembers } from '../../hooks/useTeam';
import { useAssignTask } from '../../hooks/useTasks';
import type { TaskResponse } from '../../types/task.types';

interface AssignFormValues {
  memberIds: number[];
  dueDate: Dayjs;
}

interface AssignTaskModalProps {
  task: TaskResponse | null;
  onClose: () => void;
}

/** Asignar un pendiente PENDIENTE: personas + fecha de entrega. */
export function AssignTaskModal({ task, onClose }: AssignTaskModalProps) {
  const [form] = Form.useForm<AssignFormValues>();
  const { data: members, isLoading: membersLoading } = useTeamMembers('active');
  const assignTask = useAssignTask();
  const open = task !== null;

  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);

  const handleSubmit = async () => {
    if (!task) return;
    const values = await form.validateFields();
    assignTask.mutate(
      {
        id: task.id,
        data: {
          memberIds: values.memberIds,
          dueDate: values.dueDate.toISOString(),
        },
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal
      open={open}
      title={task ? `Asignar pendiente #${task.id}` : 'Asignar pendiente'}
      okText="Asignar"
      cancelText="Cancelar"
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={assignTask.isPending}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="memberIds"
          label="Personas asignadas"
          rules={[{ required: true, message: 'Selecciona al menos una persona' }]}
        >
          <Select
            mode="multiple"
            placeholder="Selecciona personas"
            loading={membersLoading}
            optionFilterProp="label"
            options={(members ?? []).map((member) => ({
              value: member.id,
              label: member.name,
            }))}
          />
        </Form.Item>
        <Form.Item
          name="dueDate"
          label="Fecha de entrega"
          rules={[{ required: true, message: 'La fecha de entrega es obligatoria' }]}
        >
          <DatePicker
            style={{ width: '100%' }}
            format="DD/MM/YYYY"
            disabledDate={(date) => date.isBefore(dayjs().startOf('day'))}
            placeholder="Selecciona la fecha"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
