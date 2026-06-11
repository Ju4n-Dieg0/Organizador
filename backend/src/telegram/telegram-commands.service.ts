import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Context, Telegraf } from 'telegraf';
import { ClientResponseDto } from '../clients/dto/client-response.dto';
import { ClientsService } from '../clients/clients.service';
import {
  TASK_STATUSES,
  TaskResponseDto,
  TaskStatus,
} from '../tasks/dto/task-response.dto';
import { TasksService } from '../tasks/tasks.service';
import { TeamMemberResponseDto } from '../team-members/dto/team-member-response.dto';
import { TeamMembersService } from '../team-members/team-members.service';

class UsageError extends Error {}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const STATUS_EMOJI: Record<string, string> = {
  PENDIENTE: '🆕',
  ASIGNADO: '📌',
  EXTENDIDO: '⏳',
  TERMINADO: '✅',
};

const AYUDA = [
  '<b>Comandos disponibles</b> (separador de argumentos: |)',
  '',
  '/clientes — clientes activos',
  '/personas — miembros del equipo',
  '/pendientes [cliente] — pendientes abiertos (filtro opcional)',
  '/pendiente &lt;cliente&gt; | &lt;título&gt; | [link1, link2] — crear pendiente',
  '  Ej: /pendiente Acme | Subir reel | https://drive.google.com/x',
  '/asignar &lt;id&gt; | &lt;persona[, persona2]&gt; | &lt;fecha YYYY-MM-DD&gt;',
  '  Ej: /asignar 12 | Ana, Luis | 2026-06-20',
  '/reasignar &lt;id&gt; | &lt;persona&gt; | &lt;razón&gt;',
  '  Ej: /reasignar 12 | Marta | Ana está de vacaciones',
  '/extender &lt;id&gt; | &lt;fecha YYYY-MM-DD&gt; | &lt;razón&gt;',
  '  Ej: /extender 12 | 2026-06-25 | Cliente pidió cambios',
  '/estado &lt;id&gt; | &lt;estado&gt; | [razón] — cambio de estado genérico',
  '  Ej: /estado 12 | TERMINADO',
  '/terminar &lt;id&gt; — marcar como TERMINADO',
].join('\n');

@Injectable()
export class TelegramCommandsService {
  private readonly logger = new Logger(TelegramCommandsService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly tasksService: TasksService,
    private readonly clientsService: ClientsService,
    private readonly teamMembersService: TeamMembersService,
  ) {}

  register(bot: Telegraf): void {
    // Solo el dueño ejecuta comandos
    bot.use(async (ctx, next) => {
      const ownerChatId = this.config.get<string>('TELEGRAM_OWNER_CHAT_ID');
      const chatId = ctx.chat ? String(ctx.chat.id) : '';
      if (!ownerChatId || chatId !== ownerChatId) {
        await ctx.reply('Este bot solo acepta comandos del administrador.');
        return;
      }
      await next();
    });

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
  }

  // ---------- comandos ----------

  private async ayuda(ctx: Context): Promise<void> {
    await this.replyHtml(ctx, AYUDA);
  }

  private async clientes(ctx: Context): Promise<void> {
    const clients = await this.clientsService.findAll({ status: 'active' });
    if (clients.length === 0) {
      await this.replyHtml(ctx, 'No hay clientes activos.');
      return;
    }
    const lines = clients.map((c) => {
      const plan = c.plan ? ` — ${escapeHtml(c.plan.name)}` : '';
      return `#${c.id} <b>${escapeHtml(c.name)}</b>${plan} (${c.openTaskCount} pendientes abiertos)`;
    });
    await this.replyHtml(ctx, `<b>Clientes activos</b>\n${lines.join('\n')}`);
  }

  private async personas(ctx: Context): Promise<void> {
    const members = await this.teamMembersService.findAll({ status: 'all' });
    if (members.length === 0) {
      await this.replyHtml(ctx, 'No hay personas registradas.');
      return;
    }
    const lines = members.map((m) => {
      const alerta = m.telegramChatId ? '🔔' : '🔕';
      const estado = m.active ? '' : ' (inactiva)';
      return `#${m.id} <b>${escapeHtml(m.name)}</b> ${alerta}${estado} — ${m.activeTaskCount} pendientes activos`;
    });
    await this.replyHtml(ctx, `<b>Equipo</b>\n${lines.join('\n')}`);
  }

  private async pendientes(ctx: Context): Promise<void> {
    const [filter] = this.args(ctx);
    let clientId: number | undefined;
    let title = 'Pendientes abiertos';
    if (filter) {
      const client = await this.resolveClient(ctx, filter);
      if (!client) return; // ya respondió con ambigüedad/no encontrado
      clientId = client.id;
      title = `Pendientes abiertos de ${escapeHtml(client.name)}`;
    }
    const tasks = (await this.tasksService.findAll({ clientId })).filter(
      (t) => t.status !== 'TERMINADO',
    );
    if (tasks.length === 0) {
      await this.replyHtml(ctx, `${title}: no hay pendientes. 🎉`);
      return;
    }
    const lines = tasks.map((t) => this.taskLine(t));
    await this.replyHtml(ctx, `<b>${title}</b>\n${lines.join('\n')}`);
  }

  private async pendiente(ctx: Context): Promise<void> {
    const [clientName, title, linksRaw] = this.args(ctx);
    if (!clientName || !title) {
      throw new UsageError(
        'Formato: /pendiente <cliente> | <título> | [link1, link2]\nEj: /pendiente Acme | Subir reel | https://drive.google.com/x',
      );
    }
    const client = await this.resolveClient(ctx, clientName);
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
    await this.replyHtml(ctx, `🆕 Pendiente creado:\n${this.taskBlock(task)}`);
  }

  private async asignar(ctx: Context): Promise<void> {
    const [idRaw, peopleRaw, dateRaw] = this.args(ctx);
    if (!idRaw || !peopleRaw || !dateRaw) {
      throw new UsageError(
        'Formato: /asignar <id> | <persona[, persona2]> | <fecha YYYY-MM-DD>\nEj: /asignar 12 | Ana, Luis | 2026-06-20',
      );
    }
    const id = this.parseId(idRaw);
    const members = await this.resolveMembers(ctx, peopleRaw);
    if (!members) return;
    const dueDate = this.parseDate(dateRaw);
    const task = await this.tasksService.assign(id, {
      memberIds: members.map((m) => m.id),
      dueDate,
    });
    await this.replyHtml(ctx, `📌 Pendiente asignado:\n${this.taskBlock(task)}`);
  }

  private async reasignar(ctx: Context): Promise<void> {
    const [idRaw, peopleRaw, reason] = this.args(ctx);
    if (!idRaw || !peopleRaw || !reason) {
      throw new UsageError(
        'Formato: /reasignar <id> | <persona[, persona2]> | <razón>\nEj: /reasignar 12 | Marta | Ana está de vacaciones',
      );
    }
    const id = this.parseId(idRaw);
    const members = await this.resolveMembers(ctx, peopleRaw);
    if (!members) return;
    const task = await this.tasksService.reassign(id, {
      memberIds: members.map((m) => m.id),
      reason,
    });
    await this.replyHtml(
      ctx,
      `🔄 Pendiente reasignado:\n${this.taskBlock(task)}`,
    );
  }

  private async extender(ctx: Context): Promise<void> {
    const [idRaw, dateRaw, reason] = this.args(ctx);
    if (!idRaw || !dateRaw || !reason) {
      throw new UsageError(
        'Formato: /extender <id> | <fecha YYYY-MM-DD> | <razón>\nEj: /extender 12 | 2026-06-25 | Cliente pidió cambios',
      );
    }
    const id = this.parseId(idRaw);
    const newDueDate = this.parseDate(dateRaw);
    const task = await this.tasksService.extend(id, { newDueDate, reason });
    await this.replyHtml(
      ctx,
      `⏳ Pendiente extendido:\n${this.taskBlock(task)}`,
    );
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
    await this.replyHtml(
      ctx,
      `${STATUS_EMOJI[task.status] ?? ''} Estado actualizado:\n${this.taskBlock(task)}`,
    );
  }

  private async terminar(ctx: Context): Promise<void> {
    const [idRaw] = this.args(ctx);
    if (!idRaw) {
      throw new UsageError('Formato: /terminar <id>\nEj: /terminar 12');
    }
    const id = this.parseId(idRaw);
    const task = await this.tasksService.complete(id);
    await this.replyHtml(
      ctx,
      `✅ Pendiente terminado:\n${this.taskBlock(task)}`,
    );
  }

  // ---------- helpers ----------

  private async safe(ctx: Context, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      if (err instanceof UsageError) {
        await ctx.reply(`⚠️ ${err.message}`);
        return;
      }
      if (err instanceof HttpException) {
        await ctx.reply(`⚠️ ${this.httpMessage(err)}`);
        return;
      }
      this.logger.error(
        `Error en comando de Telegram: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
      );
      await ctx.reply('⚠️ Ocurrió un error inesperado al procesar el comando.');
    }
  }

  private httpMessage(err: HttpException): string {
    const res = err.getResponse();
    if (typeof res === 'string') return res;
    const message = (res as { message?: string | string[] }).message;
    if (Array.isArray(message)) return message.join('\n');
    return message ?? err.message;
  }

  private args(ctx: Context): string[] {
    const text =
      ctx.message && 'text' in ctx.message ? ctx.message.text : '';
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

  private parseDate(raw: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      throw new UsageError(
        `"${raw}" no es una fecha válida. Usa el formato YYYY-MM-DD (ej: 2026-06-20).`,
      );
    }
    const date = new Date(`${raw}T12:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new UsageError(`"${raw}" no es una fecha válida.`);
    }
    return date.toISOString();
  }

  /** Resuelve un cliente activo por nombre parcial (case-insensitive). */
  private async resolveClient(
    ctx: Context,
    name: string,
  ): Promise<ClientResponseDto | null> {
    const matches = await this.clientsService.findAll({
      status: 'active',
      search: name,
    });
    if (matches.length === 0) {
      await this.replyHtml(
        ctx,
        `No encontré ningún cliente activo que coincida con "${escapeHtml(name)}". Usa /clientes para ver la lista.`,
      );
      return null;
    }
    if (matches.length > 1) {
      const exact = matches.find(
        (c) => c.name.toLowerCase() === name.toLowerCase(),
      );
      if (exact) return exact;
      const options = matches
        .map((c) => `#${c.id} ${escapeHtml(c.name)}`)
        .join('\n');
      await this.replyHtml(
        ctx,
        `Hay varios clientes que coinciden con "${escapeHtml(name)}". Sé más específico:\n${options}`,
      );
      return null;
    }
    return matches[0];
  }

  /** Resuelve personas activas por nombres parciales separados por coma. */
  private async resolveMembers(
    ctx: Context,
    peopleRaw: string,
  ): Promise<TeamMemberResponseDto[] | null> {
    const names = peopleRaw
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);
    if (names.length === 0) {
      throw new UsageError('Debes indicar al menos una persona.');
    }
    const members = await this.teamMembersService.findAll({
      status: 'active',
    });
    const resolved: TeamMemberResponseDto[] = [];
    for (const name of names) {
      const lower = name.toLowerCase();
      const matches = members.filter((m) =>
        m.name.toLowerCase().includes(lower),
      );
      if (matches.length === 0) {
        await this.replyHtml(
          ctx,
          `No encontré ninguna persona activa que coincida con "${escapeHtml(name)}". Usa /personas para ver la lista.`,
        );
        return null;
      }
      if (matches.length > 1) {
        const exact = matches.find((m) => m.name.toLowerCase() === lower);
        if (exact) {
          resolved.push(exact);
          continue;
        }
        const options = matches
          .map((m) => `#${m.id} ${escapeHtml(m.name)}`)
          .join('\n');
        await this.replyHtml(
          ctx,
          `Hay varias personas que coinciden con "${escapeHtml(name)}". Sé más específico:\n${options}`,
        );
        return null;
      }
      resolved.push(matches[0]);
    }
    return resolved;
  }

  private taskLine(t: TaskResponseDto): string {
    const emoji = STATUS_EMOJI[t.status] ?? '';
    const due = t.dueDate ? ` — 📅 ${t.dueDate.slice(0, 10)}` : '';
    const people = t.assignees.length
      ? ` — 👤 ${escapeHtml(t.assignees.map((a) => a.name).join(', '))}`
      : '';
    return `${emoji} #${t.id} <b>${escapeHtml(t.title)}</b> — ${escapeHtml(t.client.name)}${due}${people}`;
  }

  private taskBlock(t: TaskResponseDto): string {
    const lines = [
      `<b>#${t.id} ${escapeHtml(t.title)}</b>`,
      `Cliente: ${escapeHtml(t.client.name)}`,
      `Estado: ${STATUS_EMOJI[t.status] ?? ''} ${t.status}`,
    ];
    if (t.dueDate) lines.push(`Entrega: ${t.dueDate.slice(0, 10)}`);
    if (t.assignees.length) {
      lines.push(
        `Asignado a: ${escapeHtml(t.assignees.map((a) => a.name).join(', '))}`,
      );
    }
    for (const link of t.links) {
      lines.push(
        `🔗 <a href="${escapeHtml(link.url)}">${escapeHtml(link.label ?? link.url)}</a>`,
      );
    }
    return lines.join('\n');
  }

  private async replyHtml(ctx: Context, html: string): Promise<void> {
    await ctx.reply(html, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  }
}
