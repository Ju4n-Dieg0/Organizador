export const COMMENT_AUTHOR_TYPES = ['DUENO', 'MIEMBRO'] as const;
export type CommentAuthorType = (typeof COMMENT_AUTHOR_TYPES)[number];

export class TaskCommentResponseDto {
  id: number;
  taskId: number;
  authorType: CommentAuthorType;
  /** 'Administrador' (DUENO) o nombre del miembro ('Miembro eliminado' si ya no existe). */
  authorName: string;
  text: string;
  createdAt: string;
}
