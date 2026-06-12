import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import { NotificationsService } from '../notifications/notifications.service';
import {
  TelegramSender,
  TelegramSendOptions,
} from '../notifications/telegram-sender.interface';
import { BotInfoProvider } from '../telegram-info/bot-info.interface';
import { BotInfoService } from '../telegram-info/bot-info.service';
import { TelegramCommandsService } from './telegram-commands.service';
import { TelegramConversationService } from './telegram-conversation.service';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramRequestsService } from './telegram-requests.service';
import { TelegramTeamConversationService } from './telegram-team-conversation.service';

@Injectable()
export class TelegramService
  implements TelegramSender, BotInfoProvider, OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(TelegramService.name);
  private bot: Telegraf | null = null;
  private cachedBotUsername: string | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly linkService: TelegramLinkService,
    private readonly teamConversationService: TelegramTeamConversationService,
    private readonly commandsService: TelegramCommandsService,
    private readonly requestsService: TelegramRequestsService,
    private readonly conversationService: TelegramConversationService,
    private readonly notificationsService: NotificationsService,
    private readonly botInfoService: BotInfoService,
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
    // ANTES del middleware de solo-dueño: /start <token> acepta cualquier chat.
    this.linkService.register(this.bot);
    // También antes: texto libre de chats vinculados a un miembro (hace
    // next() para el dueño y para chats desconocidos).
    this.teamConversationService.register(this.bot);
    this.commandsService.register(this.bot);
    // Después del middleware de dueño y antes del texto libre del dueño:
    // callbacks Aceptar/Rechazar y captura de la razón de rechazo.
    this.requestsService.register(this.bot);
    // Al final: el modo conversacional del dueño consume el texto restante.
    this.conversationService.register(this.bot);
    this.notificationsService.setSender(this);
    this.botInfoService.setProvider(this);

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

  /** BotInfoProvider: username del bot (cacheado; getMe es llamada de red). */
  async getBotUsername(): Promise<string | null> {
    if (!this.bot) {
      return null;
    }
    if (this.cachedBotUsername) {
      return this.cachedBotUsername;
    }
    const me = await this.bot.telegram.getMe();
    this.cachedBotUsername = me.username;
    return this.cachedBotUsername;
  }

  async sendMessage(
    chatId: string,
    html: string,
    options?: TelegramSendOptions,
  ): Promise<void> {
    if (!this.bot) {
      return;
    }
    await this.bot.telegram.sendMessage(chatId, html, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...(options?.inlineKeyboard
        ? {
            reply_markup: {
              inline_keyboard: options.inlineKeyboard.map((row) =>
                row.map((b) => ({ text: b.text, callback_data: b.callbackData })),
              ),
            },
          }
        : {}),
    });
  }
}
