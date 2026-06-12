import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Context, Telegraf } from 'telegraf';
import { TeamMembersService } from '../team-members/team-members.service';
import { escapeHtml, handleTelegramError, replyHtml } from './telegram-format';

/**
 * Vinculación del equipo por deep link de /start (ver docs/SPEC.md).
 *
 * ÚNICA excepción al middleware de solo-dueño: este handler se registra ANTES
 * de TelegramCommandsService.register(), por lo que acepta /start de cualquier
 * chat. Todo lo demás (comandos, texto libre) sigue restringido al dueño.
 */
@Injectable()
export class TelegramLinkService {
  private readonly logger = new Logger(TelegramLinkService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly teamMembersService: TeamMembersService,
  ) {}

  register(bot: Telegraf): void {
    bot.start(async (ctx, next) => {
      try {
        const token = this.extractToken(ctx);
        const chatId = String(ctx.chat.id);
        const ownerChatId = this.config.get<string>('TELEGRAM_OWNER_CHAT_ID');
        const isOwner = !!ownerChatId && chatId === ownerChatId;

        if (!token) {
          if (isOwner) {
            // Comportamiento previo: el /start del dueño cae al middleware de
            // solo-dueño y al bot.start de comandos, que muestra la ayuda.
            await next();
            return;
          }
          await ctx.reply(
            'Hola 👋 Este bot envía recordatorios al equipo de la agencia. ' +
              'Para vincular este chat, pide al administrador un enlace de ' +
              'vinculación y ábrelo desde aquí.',
          );
          return;
        }

        // Con token (cualquier chat, incluido el dueño): canjear SIEMPRE,
        // sin caer a la ayuda ni al middleware de solo-dueño.
        const result = await this.teamMembersService.redeemTelegramLinkToken(
          token,
          chatId,
        );

        if (result.kind === 'linked') {
          let message = `✅ Listo, <b>${escapeHtml(result.memberName)}</b>: quedaste vinculado/a y recibirás recordatorios aquí.`;
          if (result.relinkedFrom) {
            message += `\n\nℹ️ Este chat estaba vinculado a <b>${escapeHtml(result.relinkedFrom)}</b> y se re-vinculó a <b>${escapeHtml(result.memberName)}</b>.`;
          }
          await replyHtml(ctx, message);
          return;
        }

        if (result.kind === 'expired') {
          await ctx.reply(
            '⚠️ Este enlace de vinculación ya venció o ya se usó. ' +
              'Pide al administrador un nuevo enlace e inténtalo de nuevo.',
          );
          return;
        }

        await ctx.reply(
          '⚠️ Este enlace de vinculación no es válido. ' +
            'Pide al administrador un nuevo enlace e inténtalo de nuevo.',
        );
      } catch (err) {
        await handleTelegramError(ctx, err, this.logger, 'la vinculación');
      }
    });
  }

  /** Payload de /start (deep link): Telegraf lo expone en ctx.payload. */
  private extractToken(ctx: Context & { payload?: string }): string | null {
    if (typeof ctx.payload === 'string' && ctx.payload.trim()) {
      return ctx.payload.trim();
    }
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const rest = text.replace(/^\/start(@\w+)?\s*/, '').trim();
    return rest || null;
  }
}
