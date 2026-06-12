import {
  CommentAuthorType,
  TaskCommentResponseDto,
} from './dto/task-comment-response.dto';
import { TaskCommentWithMember } from './task-comments.repository';

export class TaskCommentsMapper {
  static toResponse(comment: TaskCommentWithMember): TaskCommentResponseDto {
    return {
      id: comment.id,
      taskId: comment.taskId,
      authorType: comment.authorType as CommentAuthorType,
      authorName:
        comment.authorType === 'DUENO'
          ? 'Administrador'
          : (comment.member?.name ?? 'Miembro eliminado'),
      text: comment.text,
      createdAt: comment.createdAt.toISOString(),
    };
  }
}
