export const TASK_STATUSES = [
  'PENDIENTE',
  'ASIGNADO',
  'TERMINADO',
  'EXTENDIDO',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_EVENT_TYPES = [
  'CREACION',
  'ASIGNACION',
  'REASIGNACION',
  'EXTENSION',
  'CAMBIO_ESTADO',
] as const;
export type TaskEventType = (typeof TASK_EVENT_TYPES)[number];

export class TaskLinkResponseDto {
  id: number;
  url: string;
  label: string | null;
}

export class TaskAssigneeResponseDto {
  memberId: number;
  name: string;
  assignedAt: string;
}

export class TaskResponseDto {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueDate: string | null;
  client: { id: number; name: string };
  links: TaskLinkResponseDto[];
  assignees: TaskAssigneeResponseDto[];
  createdAt: string;
  updatedAt: string;
}

export class TaskEventResponseDto {
  id: number;
  type: TaskEventType;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus | null;
  reason: string | null;
  detail: string | null;
  createdAt: string;
}

export class TaskDetailResponseDto extends TaskResponseDto {
  events: TaskEventResponseDto[];
}
