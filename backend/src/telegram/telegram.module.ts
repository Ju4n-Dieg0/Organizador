import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/clients.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TasksModule } from '../tasks/tasks.module';
import { TeamMembersModule } from '../team-members/team-members.module';
import { TelegramCommandsService } from './telegram-commands.service';
import { TelegramService } from './telegram.service';

@Module({
  imports: [
    NotificationsModule,
    TasksModule,
    ClientsModule,
    TeamMembersModule,
  ],
  providers: [TelegramService, TelegramCommandsService],
  exports: [TelegramService],
})
export class TelegramModule {}
