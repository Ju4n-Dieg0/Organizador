import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// Solo el TIPO del DTO: notifications nunca importa el módulo requests
// (requests importa NotificationsModule; un import runtime sería circular).
import type { TeamRequestResponseDto } from '../requests/dto/team-request-response.dto';
import { TaskResponseDto } from '../tasks/dto/task-response.dto';
import { TeamMembersService } from '../team-members/team-members.service';
import { TelegramSender, TelegramSendOptions } from './telegram-sender.interface';

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

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private sender: TelegramSender | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly teamMembersService: TeamMembersService,
  ) {}

  /** Registrado por el módulo de Telegram cuando el bot está activo. */
  setSender(sender: TelegramSender): void {
    this.sender = sender;
  }

  async sendToOwner(html: string, options?: TelegramSendOptions): Promise<void> {
    const ownerChatId = this.config.get<string>('TELEGRAM_OWNER_CHAT_ID');
    if (!ownerChatId) {
      this.logger.debug(
        'TELEGRAM_OWNER_CHAT_ID vacío: se omite la notificación al dueño',
      );
      return;
    }
    await this.send(ownerChatId, html, options);
  }

  async sendToMember(chatId: string, html: string): Promise<void> {
    await this.send(chatId, html);
  }

  async notifyTaskCreated(task: TaskResponseDto): Promise<void> {
    await this.sendToOwner(
      `🆕 <b>Pendiente creado</b>\n${this.formatTask(task)}`,
    );
  }

  async notifyTaskAssigned(task: TaskResponseDto): Promise<void> {
    await this.sendToOwner(
      `📌 <b>Pendiente asignado</b>\n${this.formatTask(task)}`,
    );
    await this.notifyAssignees(
      task,
      `📌 <b>Te asignaron un pendiente</b>\n${this.formatTask(task)}`,
    );
  }

  async notifyTaskReassigned(
    task: TaskResponseDto,
    detail: string,
    reason: string,
  ): Promise<void> {
    const extra = `\nCambio: ${escapeHtml(detail)}\nRazón: ${escapeHtml(reason)}`;
    await this.sendToOwner(
      `🔄 <b>Pendiente reasignado</b>\n${this.formatTask(task)}${extra}`,
    );
    await this.notifyAssignees(
      task,
      `🔄 <b>Te reasignaron un pendiente</b>\n${this.formatTask(task)}\nRazón: ${escapeHtml(reason)}`,
    );
  }

  async notifyTaskExtended(
    task: TaskResponseDto,
    reason: string,
  ): Promise<void> {
    const extra = reason ? `\nRazón: ${escapeHtml(reason)}` : '';
    await this.sendToOwner(
      `⏳ <b>Pendiente extendido</b>\n${this.formatTask(task)}${extra}`,
    );
    await this.notifyAssignees(
      task,
      `⏳ <b>Pendiente extendido</b>\n${this.formatTask(task)}${extra}`,
    );
  }

  async notifyTaskCompleted(task: TaskResponseDto): Promise<void> {
    await this.sendToOwner(
      `✅ <b>Pendiente terminado</b>\n${this.formatTask(task)}`,
    );
    await this.notifyAssignees(
      task,
      `✅ <b>Pendiente terminado</b>\n${this.formatTask(task)}`,
    );
  }

  /**
   * Un miembro terminó el pendiente desde Telegram: el dueño ve quién fue
   * y los demás asignados reciben la notificación de terminado habitual.
   */
  async notifyTaskCompletedByMember(
    task: TaskResponseDto,
    memberName: string,
  ): Promise<void> {
    await this.sendToOwner(
      `✅ <b>${escapeHtml(memberName)}</b> marcó como terminado\n${this.formatTask(task)}`,
    );
    await this.notifyAssignees(
      task,
      `✅ <b>Pendiente terminado</b>\n${this.formatTask(task)}`,
      memberName,
    );
  }

  /** Nueva solicitud del equipo: aviso al dueño con botones Aceptar/Rechazar. */
  async notifyRequestCreated(request: TeamRequestResponseDto): Promise<void> {
    await this.sendToOwner(
      `📨 <b>Nueva solicitud #${request.id}</b>\n${escapeHtml(request.summary)}`,
      {
        inlineKeyboard: [
          [
            { text: 'Aceptar', callbackData: `req:approve:${request.id}` },
            { text: 'Rechazar', callbackData: `req:reject:${request.id}` },
          ],
        ],
      },
    );
  }

  /** Solicitud resuelta: aviso al solicitante por su chat vinculado (si lo tiene). */
  async notifyRequestResolved(request: TeamRequestResponseDto): Promise<void> {
    const members = await this.teamMembersService.findAllInternal();
    const requester = members.find((m) => m.id === request.requester.id);
    if (!requester?.telegramChatId) {
      this.logger.debug(
        `Solicitante #${request.requester.id} sin chat vinculado: se omite la notificación de la solicitud #${request.id}`,
      );
      return;
    }
    const html =
      request.status === 'APROBADA'
        ? `✅ Tu solicitud fue aprobada: ${escapeHtml(request.summary)}`
        : `❌ Tu solicitud fue rechazada: ${escapeHtml(request.summary)}\nRazón: ${escapeHtml(request.rejectionReason ?? '')}`;
    await this.sendToMember(requester.telegramChatId, html);
  }

  /** Resumen al dueño + alerta individual a cada asignado con chatId. */
  async notifyReminders(tasks: TaskResponseDto[]): Promise<void> {
    if (tasks.length === 0) {
      return;
    }
    const summary = tasks.map((t) => this.formatReminderLine(t)).join('\n');
    await this.sendToOwner(
      `⏰ <b>Recordatorio de pendientes</b> (${tasks.length})\n${summary}`,
    );

    const members = await this.teamMembersService.findAllInternal();
    for (const member of members) {
      if (!member.telegramChatId) continue;
      const own = tasks.filter((t) =>
        t.assignees.some((a) => a.memberId === member.id),
      );
      if (own.length === 0) continue;
      const lines = own.map((t) => this.formatReminderLine(t)).join('\n');
      await this.sendToMember(
        member.telegramChatId,
        `⏰ <b>Tienes pendientes próximos a vencer</b>\n${lines}`,
      );
    }
  }

  private async notifyAssignees(
    task: TaskResponseDto,
    html: string,
    excludeMemberName?: string,
  ): Promise<void> {
    if (task.assignees.length === 0) return;
    const members = await this.teamMembersService.findAllInternal();
    for (const member of members) {
      if (!member.telegramChatId) continue;
      if (!task.assignees.some((a) => a.memberId === member.id)) continue;
      if (excludeMemberName && member.name === excludeMemberName) continue;
      await this.sendToMember(member.telegramChatId, html);
    }
  }

  private formatTask(task: TaskResponseDto): string {
    const emoji = STATUS_EMOJI[task.status] ?? '';
    const lines = [
      `<b>#${task.id} ${escapeHtml(task.title)}</b>`,
      `Cliente: ${escapeHtml(task.client.name)}`,
      `Estado: ${emoji} ${task.status}`,
    ];
    if (task.dueDate) {
      lines.push(`Entrega: ${task.dueDate.slice(0, 10)}`);
    }
    if (task.assignees.length > 0) {
      lines.push(
        `Asignado a: ${escapeHtml(task.assignees.map((a) => a.name).join(', '))}`,
      );
    }
    for (const link of task.links) {
      lines.push(
        `🔗 <a href="${escapeHtml(link.url)}">${escapeHtml(link.label ?? link.url)}</a>`,
      );
    }
    return lines.join('\n');
  }

  private formatReminderLine(task: TaskResponseDto): string {
    const due = task.dueDate ? task.dueDate.slice(0, 10) : 'sin fecha';
    const tag = this.dueTag(task.dueDate);
    const people = task.assignees.map((a) => a.name).join(', ');
    return `• #${task.id} ${escapeHtml(task.title)} — ${escapeHtml(task.client.name)} — ${due} ${tag} — ${escapeHtml(people)}`;
  }

  private dueTag(dueDate: string | null): string {
    if (!dueDate) return '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(today);
    dayAfter.setDate(dayAfter.getDate() + 2);
    const due = new Date(dueDate);
    if (due < today) return '(VENCIDA ⚠️)';
    if (due < tomorrow) return '(hoy)';
    if (due < dayAfter) return '(mañana)';
    return '';
  }

  private async send(
    chatId: string,
    html: string,
    options?: TelegramSendOptions,
  ): Promise<void> {
    if (!this.sender) {
      this.logger.debug(
        'Bot de Telegram desactivado: se omite el envío de la notificación',
      );
      return;
    }
    try {
      await this.sender.sendMessage(chatId, html, options);
    } catch (err) {
      this.logger.error(
        `Error enviando mensaje de Telegram a ${chatId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
