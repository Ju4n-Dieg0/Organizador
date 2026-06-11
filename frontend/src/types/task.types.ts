export type TaskStatus = 'PENDIENTE' | 'ASIGNADO' | 'TERMINADO' | 'EXTENDIDO';

export type TaskEventType =
  | 'CREACION'
  | 'ASIGNACION'
  | 'REASIGNACION'
  | 'EXTENSION'
  | 'CAMBIO_ESTADO';

export interface TaskLinkResponse {
  id: number;
  url: string;
  label: string | null;
}

export interface TaskAssigneeResponse {
  memberId: number;
  name: string;
  assignedAt: string;
}

export interface TaskResponse {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueDate: string | null;
  client: { id: number; name: string };
  links: TaskLinkResponse[];
  assignees: TaskAssigneeResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskEventResponse {
  id: number;
  type: TaskEventType;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus | null;
  reason: string | null;
  detail: string | null;
  createdAt: string;
}

export interface TaskDetailResponse extends TaskResponse {
  events: TaskEventResponse[];
}

export interface TaskLinkInput {
  url: string;
  label?: string;
}

export interface CreateTaskRequest {
  clientId: number;
  title: string;
  description?: string;
  links?: TaskLinkInput[];
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  /** Reemplaza la lista completa */
  links?: TaskLinkInput[];
}

export interface AssignTaskRequest {
  memberIds: number[];
  dueDate: string;
}

export interface ReassignTaskRequest {
  memberIds: number[];
  reason: string;
}

export interface ExtendTaskRequest {
  newDueDate: string;
  reason: string;
}

export interface ChangeTaskStatusRequest {
  status: TaskStatus;
  reason?: string;
}

export interface TasksQuery {
  status?: TaskStatus;
  clientId?: number;
  memberId?: number;
  search?: string;
}
