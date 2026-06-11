import {
  TaskDetailResponseDto,
  TaskEventType,
  TaskResponseDto,
  TaskStatus,
} from './dto/task-response.dto';
import { TaskWithEvents, TaskWithRelations } from './tasks.repository';

export class TasksMapper {
  static toResponse(task: TaskWithRelations): TaskResponseDto {
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status as TaskStatus,
      dueDate: task.dueDate ? task.dueDate.toISOString() : null,
      client: { id: task.client.id, name: task.client.name },
      links: task.links.map((l) => ({ id: l.id, url: l.url, label: l.label })),
      assignees: task.assignees.map((a) => ({
        memberId: a.memberId,
        name: a.member.name,
        assignedAt: a.assignedAt.toISOString(),
      })),
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }

  static toDetailResponse(task: TaskWithEvents): TaskDetailResponseDto {
    return {
      ...TasksMapper.toResponse(task),
      events: task.events.map((e) => ({
        id: e.id,
        type: e.type as TaskEventType,
        fromStatus: (e.fromStatus as TaskStatus | null) ?? null,
        toStatus: (e.toStatus as TaskStatus | null) ?? null,
        reason: e.reason,
        detail: e.detail,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }
}
