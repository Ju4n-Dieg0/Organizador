import { ConflictException, HttpException, Injectable, Logger } from '@nestjs/common';
import { Context, Telegraf } from 'telegraf';
import { callbackQuery, message } from 'telegraf/filters';
import { RequestsService } from '../requests/requests.service';
import { escapeHtml, httpMessage } from './telegram-format';
import { CANCELS, normalizeReply } from './telegram-conversation.service';

/** Vida útil del estado «esperando razón de rechazo»: 10 minutos. */
const REJECT_TTL_MS = 10 * 60 * 1000;

/** Mensaje original (del aviso con botones), para poder editarlo después. */
interface PendingRejection {
  requestId: number;
  createdAt: number;
  chatId: number | string | null;
  messageId: number | null;
  messageText: string | null;
}

/**
 * Flujo de aprobación de solicitudes del equipo desde el chat del dueño:
 * botones inline `req:approve:<id>` / `req:reject:<id>` que envía
 * NotificationsService al crearse un TeamRequest.
 *
 * Usa EXACTAMENTE el mismo RequestsService que la web (idempotencia
 * incluida: una solicitud ya resuelta responde 409, aquí traducido a una
 * respuesta amable). Se registra DESPUÉS del middleware de solo-dueño
 * (solo el dueño llega aquí) y ANTES del handler de texto libre del dueño:
 * la razón de rechazo se intercepta antes de que la procese la IA.
 */
@Injectable()
export class TelegramRequestsService {
  private readonly logger = new Logger(TelegramRequestsService.name);

  /** Rechazo en curso del chat del dueño (único chat que llega aquí). */
  private pendingRejection: PendingRejection | null = null;

  constructor(private readonly requestsService: RequestsService) {}

  register(bot: Telegraf): void {
    bot.on(callbackQuery('data'), async (ctx) => {
      const data = ctx.callbackQuery.data ?? '';
      const approve = /^req:approve:(\d+)$/.exec(data);
      const reject = /^req:reject:(\d+)$/.exec(data);
      try {
        if (approve) {
          await this.approve(ctx, Number(approve[1]));
        } else if (reject) {
          await this.startRejection(ctx, Number(reject[1]));
        } else {
          // Callback desconocido: se confirma en silencio para quitar el spinner.
          await ctx.answerCbQuery();
        }
      } catch (err) {
        this.logger.error(
          `Error procesando callback "${data}": ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
        );
        await ctx
          .answerCbQuery('Ocurrió un error inesperado al procesar la solicitud.')
          .catch(() => undefined);
      }
    });

    // Razón del rechazo: SOLO intercepta si hay un rechazo pendiente; si no,
    // deja pasar el texto al modo conversacional del dueño.
    bot.on(message('text'), async (ctx, next) => {
      const pending = this.pendingRejection;
      if (!pending) {
        await next();
        return;
      }
      if (Date.now() - pending.createdAt > REJECT_TTL_MS) {
        this.pendingRejection = null;
        await next();
        return;
      }
      const text = ctx.message.text.trim();
      // Los comandos no son razones: se procesan normal y el estado persiste.
      if (!text || text.startsWith('/')) {
        await next();
        return;
      }
      if (CANCELS.has(normalizeReply(text))) {
        this.pendingRejection = null;
        await ctx.reply(
          `Vale, no rechazo la solicitud #${pending.requestId}. Sigue pendiente.`,
        );
        return;
      }
      await this.finishRejection(ctx, pending, text);
    });
  }

  // ---------- aprobar ----------

  private async approve(ctx: Context, id: number): Promise<void> {
    try {
      await this.requestsService.approve(id, 'Dueño (Telegram)');
    } catch (err) {
      await this.handleResolveError(ctx, err, id, 'aprobar');
      return;
    }
    await ctx.answerCbQuery('Solicitud aprobada ✅').catch(() => undefined);
    await this.markCallbackMessage(ctx, '✅ Aprobada');
  }

  // ---------- rechazar (multi-turno: botón → razón) ----------

  private async startRejection(ctx: Context, id: number): Promise<void> {
    const msg =
      ctx.callbackQuery && 'message' in ctx.callbackQuery
        ? ctx.callbackQuery.message
        : undefined;
    this.pendingRejection = {
      requestId: id,
      createdAt: Date.now(),
      chatId: msg?.chat.id ?? null,
      messageId: msg?.message_id ?? null,
      messageText: msg && 'text' in msg ? msg.text : null,
    };
    await ctx.answerCbQuery().catch(() => undefined);
    await ctx.reply(
      `Escribe la razón del rechazo de la solicitud #${id} (o "cancela" para dejarla pendiente). El solicitante la verá.`,
    );
  }

  private async finishRejection(
    ctx: Context,
    pending: PendingRejection,
    reason: string,
  ): Promise<void> {
    try {
      await this.requestsService.reject(
        pending.requestId,
        reason,
        'Dueño (Telegram)',
      );
    } catch (err) {
      this.pendingRejection = null;
      if (err instanceof ConflictException) {
        await ctx.reply(`⚠️ ${httpMessage(err)}`);
        await this.editStoredMessage(ctx, pending, null);
        return;
      }
      if (err instanceof HttpException) {
        await ctx.reply(
          `⚠️ No pude rechazar la solicitud #${pending.requestId}: ${httpMessage(err)}`,
        );
        return;
      }
      throw err;
    }
    this.pendingRejection = null;
    await ctx.reply(
      `❌ Solicitud #${pending.requestId} rechazada. El solicitante recibirá la razón.`,
    );
    await this.editStoredMessage(ctx, pending, '❌ Rechazada');
  }

  // ---------- helpers ----------

  /**
   * Errores de approve: una solicitud ya resuelta (p. ej. desde la web)
   * responde amable y quita los botones; un error de negocio (transición
   * inválida…) deja la solicitud y los botones intactos.
   */
  private async handleResolveError(
    ctx: Context,
    err: unknown,
    id: number,
    action: string,
  ): Promise<void> {
    if (err instanceof HttpException) {
      const msg = httpMessage(err);
      const alreadyResolved =
        err instanceof ConflictException && /ya fue (aprobada|rechazada)/i.test(msg);
      await ctx.answerCbQuery(msg.slice(0, 190)).catch(() => undefined);
      if (alreadyResolved) {
        await this.markCallbackMessage(ctx, `ℹ️ ${escapeHtml(msg)}`);
      } else {
        await ctx.reply(`⚠️ No pude ${action} la solicitud #${id}: ${msg}`);
      }
      return;
    }
    throw err;
  }

  /** Edita el mensaje del callback: quita los botones y añade una nota. */
  private async markCallbackMessage(ctx: Context, note: string): Promise<void> {
    const msg =
      ctx.callbackQuery && 'message' in ctx.callbackQuery
        ? ctx.callbackQuery.message
        : undefined;
    try {
      if (msg && 'text' in msg) {
        await ctx.editMessageText(`${escapeHtml(msg.text)}\n\n${note}`, {
          parse_mode: 'HTML',
        });
      } else {
        await ctx.editMessageReplyMarkup(undefined);
      }
    } catch {
      // El mensaje pudo ser editado/borrado entretanto: no es crítico.
    }
  }

  /** Edita el mensaje guardado del aviso (tras resolver el rechazo). */
  private async editStoredMessage(
    ctx: Context,
    pending: PendingRejection,
    note: string | null,
  ): Promise<void> {
    if (pending.chatId === null || pending.messageId === null) {
      return;
    }
    try {
      if (pending.messageText) {
        const suffix = note ? `\n\n${note}` : '';
        await ctx.telegram.editMessageText(
          pending.chatId,
          pending.messageId,
          undefined,
          `${escapeHtml(pending.messageText)}${suffix}`,
          { parse_mode: 'HTML' },
        );
      } else {
        await ctx.telegram.editMessageReplyMarkup(
          pending.chatId,
          pending.messageId,
          undefined,
          undefined,
        );
      }
    } catch {
      // El mensaje pudo ser editado/borrado entretanto: no es crítico.
    }
  }
}
