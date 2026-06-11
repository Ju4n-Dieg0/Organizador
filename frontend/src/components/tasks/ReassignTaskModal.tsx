import { useEffect } from 'react';
import { Form, Input, Modal, Select } from 'antd';
import { useTeamMembers } from '../../hooks/useTeam';
import { useReassignTask } from '../../hooks/useTasks';
import type { TaskResponse } from '../../types/task.types';

interface ReassignFormValues {
  memberIds: number[];
  reason: string;
}

interface ReassignTaskModalProps {
  task: TaskResponse | null;
  onClose: () => void;
}

/** Reasignar un pendiente ASIGNADO/EXTENDIDO: nuevas personas + razón obligatoria. */
export function ReassignTaskModal({ task, onClose }: ReassignTaskModalProps) {
  const [form] = Form.useForm<ReassignFormValues>();
  const { data: members, isLoading: membersLoading } = useTeamMembers('active');
  const reassignTask = useReassignTask();
  const open = task !== null;

  useEffect(() => {
    if (open && task) {
      form.setFieldsValue({
        memberIds: task.assignees.map((assignee) => assignee.memberId),
        reason: undefined,
      });
    }
  }, [open, task, form]);

  const handleSubmit = async () => {
    if (!task) return;
    const values = await form.validateFields();
    reassignTask.mutate(
      {
        id: task.id,
        data: { memberIds: values.memberIds, reason: values.reason.trim() },
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal
      open={open}
      title={task ? `Reasignar pendiente #${task.id}` : 'Reasignar pendiente'}
      okText="Reasignar"
      cancelText="Cancelar"
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={reassignTask.isPending}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="memberIds"
          label="Nuevas personas asignadas"
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
          name="reason"
          label="Razón de la reasignación"
          rules={[{ required: true, message: 'La razón es obligatoria' }]}
        >
          <Input.TextArea
            placeholder="¿Por qué se reasigna este pendiente?"
            rows={3}
            maxLength={500}
            showCount
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
