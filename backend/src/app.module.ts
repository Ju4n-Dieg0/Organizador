import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { ClientsModule } from './clients/clients.module';
import { HealthModule } from './health/health.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PlansModule } from './plans/plans.module';
import { PrismaModule } from './prisma/prisma.module';
import { RemindersModule } from './reminders/reminders.module';
import { RequestsModule } from './requests/requests.module';
import { TasksModule } from './tasks/tasks.module';
import { TeamMembersModule } from './team-members/team-members.module';
import { TelegramModule } from './telegram/telegram.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    HealthModule,
    PlansModule,
    ClientsModule,
    TeamMembersModule,
    TasksModule,
    RequestsModule,
    NotificationsModule,
    AiModule,
    TelegramModule,
    RemindersModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
