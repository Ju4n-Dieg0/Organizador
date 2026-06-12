import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { TaskCommentResponseDto } from './dto/task-comment-response.dto';
import { TaskCommentsMapper } from './task-comments.mapper';
import { TaskCommentsRepository } from './task-comments.repository';
import { TasksMapper } from './tasks.mapper';
import { TasksRepository, TaskWithRelations } from './tasks.repository';

/** Autor de un comentario: el dueño (web/Telegram) o un miembro del equipo. */
export type CommentAuthor =
  | { type: 'DUENO' }
  | { type: 'MIEMBRO'; memberId: number };

/**
 * Service ÚNICO de comentarios: la web (controller) y el bot de Telegram
 * pasan por aquí. La notificación vive dentro del service, nunca en los callers.
 * Los comentarios NO generan TaskEvent: viven en su propio hilo.
 */
@Injectable()
export class TaskCommentsService {
  private readonly logger = new Logger(TaskCommentsService.name);

  constructor(
    private readonly tasksRepository: TasksRepository,
    private readonly taskCommentsRepository: TaskCommentsRepository,
    private readonly notificationsService: NotificationsService,
  ) {}

  async list(taskId: number): Promise<TaskCommentResponseDto[]> {
    await this.getTaskOrFail(taskId);
    const comments = await this.taskCommentsRepository.findByTask(taskId);
    return comments.map((c) => TaskCommentsMapper.toResponse(c));
  }

  async add(
    taskId: number,
    author: CommentAuthor,
    text: string,
  ): Promise<TaskCommentResponseDto> {
    const task = await this.getTaskOrFail(taskId);

    const trimmed = typeof text === 'string' ? text.trim() : '';
    if (!trimmed) {
      throw new BadRequestException('El comentario no puede estar vacío');
    }

    let memberId: number | null = null;
    if (author.type === 'MIEMBRO') {
      const members = await this.tasksRepository.findMembersByIds([
        author.memberId,
      ]);
      if (members.length === 0) {
        throw new NotFoundException(
          `Persona #${author.memberId} no encontrada`,
        );
      }
      memberId = author.memberId;
    }

    const comment = await this.taskCommentsRepository.create(
      taskId,
      author.type,
      memberId,
      trimmed,
    );
    const response = TaskCommentsMapper.toResponse(comment);
    const taskResponse = TasksMapper.toResponse(task);
    this.fireNotification(() =>
      this.notificationsService.notifyTaskCommented(
        taskResponse,
        response,
        memberId ?? undefined,
      ),
    );
    return response;
  }

  private async getTaskOrFail(id: number): Promise<TaskWithRelations> {
    const task = await this.tasksRepository.findById(id);
    if (!task) {
      throw new NotFoundException(`Pendiente #${id} no encontrado`);
    }
    return task;
  }

  private fireNotification(fn: () => Promise<void>): void {
    fn().catch((err: unknown) => {
      this.logger.error(
        `Error enviando notificación de Telegram: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }
}
