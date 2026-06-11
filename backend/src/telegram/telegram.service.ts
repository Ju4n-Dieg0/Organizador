import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import { NotificationsService } from '../notifications/notifications.service';
import { TelegramSender } from '../notifications/telegram-sender.interface';
import { TelegramCommandsService } from './telegram-commands.service';

@Injectable()
export class TelegramService
  implements TelegramSender, OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(TelegramService.name);
  private bot: Telegraf | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly commandsService: TelegramCommandsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  onModuleInit(): void {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      this.logger.warn(
        'TELEGRAM_BOT_TOKEN vacío: el bot de Telegram está desactivado (la app funciona normal).',
      );
      return;
    }

    this.bot = new Telegraf(token);
    this.commandsService.register(this.bot);
    this.notificationsService.setSender(this);

    // launch() solo resuelve cuando el bot se detiene: no se espera.
    this.bot.launch().catch((err: unknown) => {
      this.logger.error(
        `Error en el bot de Telegram (long polling): ${err instanceof Error ? err.message : String(err)}`,
      );
    });
    this.logger.log('Bot de Telegram iniciado (long polling).');
  }

  onApplicationShutdown(): void {
    if (this.bot) {
      try {
        this.bot.stop('SIGTERM');
      } catch {
        // el bot ya estaba detenido
      }
    }
  }

  async sendMessage(chatId: string, html: string): Promise<void> {
    if (!this.bot) {
      return;
    }
    await this.bot.telegram.sendMessage(chatId, html, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  }
}
