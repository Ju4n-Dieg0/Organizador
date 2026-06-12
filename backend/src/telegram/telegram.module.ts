import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ClientsModule } from '../clients/clients.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TasksModule } from '../tasks/tasks.module';
import { TeamMembersModule } from '../team-members/team-members.module';
import { TelegramInfoModule } from '../telegram-info/telegram-info.module';
import { TelegramCommandsService } from './telegram-commands.service';
import { TelegramConversationService } from './telegram-conversation.service';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramResolverService } from './telegram-resolver.service';
import { TelegramService } from './telegram.service';

@Module({
  imports: [
    NotificationsModule,
    TasksModule,
    ClientsModule,
    TeamMembersModule,
    AiModule,
    TelegramInfoModule,
  ],
  providers: [
    TelegramService,
    TelegramCommandsService,
    TelegramConversationService,
    TelegramLinkService,
    TelegramResolverService,
  ],
  exports: [TelegramService],
})
export class TelegramModule {}
