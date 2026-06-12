import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { TasksModule } from '../tasks/tasks.module';
import { RequestsController } from './requests.controller';
import { RequestsRepository } from './requests.repository';
import { RequestsService } from './requests.service';

@Module({
  imports: [TasksModule, NotificationsModule],
  controllers: [RequestsController],
  providers: [RequestsService, RequestsRepository],
  exports: [RequestsService],
})
export class RequestsModule {}
