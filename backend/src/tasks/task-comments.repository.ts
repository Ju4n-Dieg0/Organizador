import { Injectable } from '@nestjs/common';
import { CommentAuthorType, Prisma, TaskComment } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type TaskCommentWithMember = TaskComment & {
  member: { id: number; name: string } | null;
};

const commentInclude = {
  member: { select: { id: true, name: true } },
} satisfies Prisma.TaskCommentInclude;

@Injectable()
export class TaskCommentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByTask(taskId: number): Promise<TaskCommentWithMember[]> {
    return this.prisma.taskComment.findMany({
      where: { taskId },
      include: commentInclude,
      orderBy: { createdAt: 'asc' },
    });
  }

  create(
    taskId: number,
    authorType: CommentAuthorType,
    memberId: number | null,
    text: string,
  ): Promise<TaskCommentWithMember> {
    return this.prisma.taskComment.create({
      data: { taskId, authorType, memberId, text },
      include: commentInclude,
    });
  }
}
