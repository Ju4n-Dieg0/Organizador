import { Module } from '@nestjs/common';
import { TeamMembersModule } from '../team-members/team-members.module';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [TeamMembersModule],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
