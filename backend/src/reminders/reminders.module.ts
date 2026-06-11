import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { TasksModule } from '../tasks/tasks.module';
import { RemindersService } from './reminders.service';

@Module({
  imports: [TasksModule, NotificationsModule],
  providers: [RemindersService],
})
export class RemindersModule {}
