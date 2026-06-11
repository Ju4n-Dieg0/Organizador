import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { NotificationsService } from '../notifications/notifications.service';
import { TasksService } from '../tasks/tasks.service';

const DEFAULT_CRON = '0 9 * * *';

@Injectable()
export class RemindersService implements OnModuleInit {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly tasksService: TasksService,
    private readonly notificationsService: NotificationsService,
  ) {}

  onModuleInit(): void {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      this.logger.warn(
        'TELEGRAM_BOT_TOKEN vacío: los recordatorios programados están desactivados.',
      );
      return;
    }
    const expression =
      this.config.get<string>('REMINDER_CRON') || DEFAULT_CRON;
    const job = new CronJob(expression, () => {
      this.run().catch((err: unknown) => {
        this.logger.error(
          `Error enviando recordatorios: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    });
    this.schedulerRegistry.addCronJob('reminders', job);
    job.start();
    this.logger.log(`Recordatorios programados con cron "${expression}".`);
  }

  /** Tareas ASIGNADO/EXTENDIDO con dueDate vencida, de hoy o de mañana. */
  async run(): Promise<void> {
    const tasks = await this.tasksService.findForReminders();
    if (tasks.length === 0) {
      this.logger.log('Recordatorios: no hay pendientes próximos a vencer.');
      return;
    }
    this.logger.log(
      `Recordatorios: enviando alertas de ${tasks.length} pendiente(s).`,
    );
    await this.notificationsService.notifyReminders(tasks);
  }
}
