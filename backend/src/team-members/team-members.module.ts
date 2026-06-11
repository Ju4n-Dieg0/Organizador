import { Module } from '@nestjs/common';
import { TeamMembersController } from './team-members.controller';
import { TeamMembersRepository } from './team-members.repository';
import { TeamMembersService } from './team-members.service';

@Module({
  controllers: [TeamMembersController],
  providers: [TeamMembersService, TeamMembersRepository],
  exports: [TeamMembersService],
})
export class TeamMembersModule {}
