import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { TaskCommentsRepository } from './task-comments.repository';
import { TaskCommentsService } from './task-comments.service';
import { TasksController } from './tasks.controller';
import { TasksRepository } from './tasks.repository';
import { TasksService } from './tasks.service';

@Module({
  imports: [NotificationsModule],
  controllers: [TasksController],
  providers: [
    TasksService,
    TasksRepository,
    TaskCommentsService,
    TaskCommentsRepository,
  ],
  exports: [TasksService, TaskCommentsService],
})
export class TasksModule {}
