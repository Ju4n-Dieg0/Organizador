import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ClientsModule } from '../clients/clients.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RequestsModule } from '../requests/requests.module';
import { TasksModule } from '../tasks/tasks.module';
import { TeamMembersModule } from '../team-members/team-members.module';
import { TelegramInfoModule } from '../telegram-info/telegram-info.module';
import { TelegramCommandsService } from './telegram-commands.service';
import { TelegramConversationService } from './telegram-conversation.service';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramRequestsService } from './telegram-requests.service';
import { TelegramResolverService } from './telegram-resolver.service';
import { TelegramService } from './telegram.service';
import { TelegramTeamConversationService } from './telegram-team-conversation.service';

@Module({
  imports: [
    NotificationsModule,
    TasksModule,
    ClientsModule,
    TeamMembersModule,
    AiModule,
    TelegramInfoModule,
    RequestsModule,
  ],
  providers: [
    TelegramService,
    TelegramCommandsService,
    TelegramConversationService,
    TelegramLinkService,
    TelegramRequestsService,
    TelegramResolverService,
    TelegramTeamConversationService,
  ],
  exports: [TelegramService],
})
export class TelegramModule {}
