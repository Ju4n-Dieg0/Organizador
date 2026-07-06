import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Context, Telegraf } from 'telegraf';
import { ClientsService } from '../clients/clients.service';
import {
  TASK_STATUSES,
  TaskStatus,
} from '../tasks/dto/task-response.dto';
import { TaskCommentsService } from '../tasks/task-comments.service';
import { TasksService } from '../tasks/tasks.service';
import { TeamMembersService } from '../team-members/team-members.service';
import {
  AYUDA,
  escapeHtml,
  formatActiveClients,
  formatOpenTasks,
  formatTeam,
  handleTelegramError,
  parseDateToIso,
  replyHtml,
  STATUS_EMOJI,
  taskBlock,
  UsageError,
} from './telegram-format';
import { TelegramResolverService } from './telegram-resolver.service';

@Injectable()
export class TelegramCommandsService {
  private readonly logger = new Logger(TelegramCommandsService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly tasksService: TasksService,
    private readonly taskCommentsService: TaskCommentsService,
    private readonly clientsService: ClientsService,
    private readonly teamMembersService: TeamMembersService,
    private readonly resolver: TelegramResolverService,
  ) {}

  register(bot: Telegraf): void {
    // Solo el dueño ejecuta comandos (y todo lo registrado después, incluido
    // el handler de texto libre, queda cubierto por este middleware).
    bot.use(async (ctx, next) => {
      const ownerChatId = this.config.get<string>('TELEGRAM_OWNER_CHAT_ID');
      const chatId = ctx.chat ? String(ctx.chat.id) : '';
      if (!ownerChatId || chatId !== ownerChatId) {
        await ctx.reply('Este bot solo acepta comandos del administrador.');
        return;
      }
      await next();
    });

    // Solo se alcanza vía next() desde TelegramLinkService (dueño sin token).
    bot.start((ctx) => this.safe(ctx, () => this.ayuda(ctx)));
    bot.command('ayuda', (ctx) => this.safe(ctx, () => this.ayuda(ctx)));
    bot.command('clientes', (ctx) => this.safe(ctx, () => this.clientes(ctx)));
    bot.command('personas', (ctx) => this.safe(ctx, () => this.personas(ctx)));
    bot.command('pendientes', (ctx) =>
      this.safe(ctx, () => this.pendientes(ctx)),
    );
    bot.command('pendiente', (ctx) =>
      this.safe(ctx, () => this.pendiente(ctx)),
    );
    bot.command('asignar', (ctx) => this.safe(ctx, () => this.asignar(ctx)));
    bot.command('reasignar', (ctx) =>
      this.safe(ctx, () => this.reasignar(ctx)),
    );
    bot.command('extender', (ctx) => this.safe(ctx, () => this.extender(ctx)));
    bot.command('estado', (ctx) => this.safe(ctx, () => this.estado(ctx)));
    bot.command('terminar', (ctx) => this.safe(ctx, () => this.terminar(ctx)));
    bot.command('comentar', (ctx) =>
      this.safe(ctx, () => this.comentar(ctx)),
    );
  }

  // ---------- comandos ----------

  private async ayuda(ctx: Context): Promise<void> {
    await replyHtml(ctx, AYUDA);
  }

  private async clientes(ctx: Context): Promise<void> {
    const clients = await this.clientsService.findAll({ status: 'active' });
    await replyHtml(ctx, formatActiveClients(clients));
  }

  private async personas(ctx: Context): Promise<void> {
    const members = await this.teamMembersService.findAll({ status: 'all' });
    await replyHtml(ctx, formatTeam(members));
  }

  private async pendientes(ctx: Context): Promise<void> {
    const [filter] = this.args(ctx);
    let clientId: number | undefined;
    let memberId: number | undefined;
    let title = 'Pendientes abiertos';
    if (filter) {
      // Si el filtro no coincide con NINGÚN cliente pero sí (de forma única)
      // con una persona del equipo, se filtra por persona asignada.
      const clientRes = await this.resolver.findClient(filter);
      if (clientRes.kind === 'none') {
        const memberRes = await this.resolver.findMember(filter);
        if (memberRes.kind === 'match') {
          memberId = memberRes.entity.id;
          title = `Pendientes abiertos de ${escapeHtml(memberRes.entity.name)}`;
        }
      }
      if (memberId === undefined) {
        const client = await this.resolver.resolveClient(ctx, filter);
        if (!client) return; // ya respondió con ambigüedad/no encontrado
        clientId = client.id;
        title = `Pendientes abiertos de ${escapeHtml(client.name)}`;
      }
    }
    const tasks = (
      await this.tasksService.findAll({ clientId, memberId })
    ).filter((t) => t.status !== 'TERMINADO');
    await replyHtml(ctx, formatOpenTasks(title, tasks));
  }

  private async pendiente(ctx: Context): Promise<void> {
    const [clientName, title, linksRaw] = this.args(ctx);
    if (!clientName || !title) {
      throw new UsageError(
        'Formato: /pendiente <cliente> | <título> | [link1, link2]\nEj: /pendiente Acme | Subir reel | https://drive.google.com/x',
      );
    }
    const client = await this.resolver.resolveClient(ctx, clientName);
    if (!client) return;
    const links = linksRaw
      ? linksRaw
          .split(',')
          .map((l) => l.trim())
          .filter(Boolean)
          .map((url) => ({ url }))
      : undefined;
    const task = await this.tasksService.create({
      clientId: client.id,
      title,
      links,
    });
    await replyHtml(ctx, `🆕 Pendiente creado:\n${taskBlock(task)}`);
  }

  private async asignar(ctx: Context): Promise<void> {
    const [idRaw, peopleRaw, dateRaw] = this.args(ctx);
    if (!idRaw || !peopleRaw || !dateRaw) {
      throw new UsageError(
        'Formato: /asignar <id> | <persona[, persona2]> | <fecha YYYY-MM-DD>\nEj: /asignar 12 | Ana, Luis | 2026-06-20',
      );
    }
    const id = this.parseId(idRaw);
    const members = await this.resolver.resolveMembers(
      ctx,
      peopleRaw.split(','),
    );
    if (!members) return;
    const dueDate = parseDateToIso(dateRaw);
    const task = await this.tasksService.assign(id, {
      memberIds: members.map((m) => m.id),
      dueDate,
    });
    await replyHtml(ctx, `📌 Pendiente asignado:\n${taskBlock(task)}`);
  }

  private async reasignar(ctx: Context): Promise<void> {
    const [idRaw, peopleRaw, reason] = this.args(ctx);
    if (!idRaw || !peopleRaw || !reason) {
      throw new UsageError(
        'Formato: /reasignar <id> | <persona[, persona2]> | <razón>\nEj: /reasignar 12 | Marta | Ana está de vacaciones',
      );
    }
    const id = this.parseId(idRaw);
    const members = await this.resolver.resolveMembers(
      ctx,
      peopleRaw.split(','),
    );
    if (!members) return;
    const task = await this.tasksService.reassign(id, {
      memberIds: members.map((m) => m.id),
      reason,
    });
    await replyHtml(ctx, `🔄 Pendiente reasignado:\n${taskBlock(task)}`);
  }

  private async extender(ctx: Context): Promise<void> {
    const [idRaw, dateRaw, reason] = this.args(ctx);
    if (!idRaw || !dateRaw || !reason) {
      throw new UsageError(
        'Formato: /extender <id> | <fecha YYYY-MM-DD> | <razón>\nEj: /extender 12 | 2026-06-25 | Cliente pidió cambios',
      );
    }
    const id = this.parseId(idRaw);
    const newDueDate = parseDateToIso(dateRaw);
    const task = await this.tasksService.extend(id, { newDueDate, reason });
    await replyHtml(ctx, `⏳ Pendiente extendido:\n${taskBlock(task)}`);
  }

  private async estado(ctx: Context): Promise<void> {
    const [idRaw, statusRaw, reason] = this.args(ctx);
    if (!idRaw || !statusRaw) {
      throw new UsageError(
        `Formato: /estado <id> | <estado> | [razón]\nEstados: ${TASK_STATUSES.join(', ')}\nEj: /estado 12 | TERMINADO`,
      );
    }
    const id = this.parseId(idRaw);
    const status = statusRaw.toUpperCase() as TaskStatus;
    if (!TASK_STATUSES.includes(status)) {
      throw new UsageError(
        `Estado "${statusRaw}" no válido. Estados: ${TASK_STATUSES.join(', ')}`,
      );
    }
    const task = await this.tasksService.changeStatus(id, {
      status,
      reason: reason || undefined,
    });
    await replyHtml(
      ctx,
      `${STATUS_EMOJI[task.status] ?? ''} Estado actualizado:\n${taskBlock(task)}`,
    );
  }

  private async terminar(ctx: Context): Promise<void> {
    const [idRaw] = this.args(ctx);
    if (!idRaw) {
      throw new UsageError('Formato: /terminar <id>\nEj: /terminar 12');
    }
    const id = this.parseId(idRaw);
    const task = await this.tasksService.complete(id);
    await replyHtml(ctx, `✅ Pendiente terminado:\n${taskBlock(task)}`);
  }

  private async comentar(ctx: Context): Promise<void> {
    // El mensaje puede contener "|": se re-unen los argumentos restantes.
    const [idRaw, ...rest] = this.args(ctx);
    const message = rest.join(' | ').trim();
    if (!idRaw || !message) {
      throw new UsageError(
        'Formato: /comentar <id> | <mensaje>\nEj: /comentar 12 | El cliente cambió el logo',
      );
    }
    const id = this.parseId(idRaw);
    // La notificación a los asignados (y nunca al autor) vive en el service.
    const comment = await this.taskCommentsService.add(
      id,
      { type: 'DUENO' },
      message,
    );
    await replyHtml(
      ctx,
      `💬 Comentario agregado al pendiente #${id}:\n«${escapeHtml(comment.text)}»\nLos asignados con Telegram vinculado quedaron avisados.`,
    );
  }

  // ---------- helpers ----------

  private async safe(ctx: Context, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      await handleTelegramError(ctx, err, this.logger, 'el comando');
    }
  }

  private args(ctx: Context): string[] {
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const rest = text.replace(/^\/\w+(@\w+)?\s*/, '');
    if (!rest.trim()) return [];
    return rest.split('|').map((p) => p.trim());
  }

  private parseId(raw: string): number {
    const id = parseInt(raw.replace(/^#/, ''), 10);
    if (Number.isNaN(id) || id <= 0) {
      throw new UsageError(`"${raw}" no es un ID válido (debe ser un número).`);
    }
    return id;
  }
}
