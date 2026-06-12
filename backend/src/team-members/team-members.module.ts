import { Module } from '@nestjs/common';
import { TelegramInfoModule } from '../telegram-info/telegram-info.module';
import { TeamMembersController } from './team-members.controller';
import { TeamMembersRepository } from './team-members.repository';
import { TeamMembersService } from './team-members.service';

@Module({
  imports: [TelegramInfoModule],
  controllers: [TeamMembersController],
  providers: [TeamMembersService, TeamMembersRepository],
  exports: [TeamMembersService],
})
export class TeamMembersModule {}
