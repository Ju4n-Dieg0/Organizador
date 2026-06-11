import { Injectable, Logger } from '@nestjs/common';
import { Context, Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { AiService } from '../ai/ai.service';
import { AiContext, AiIntent } from '../ai/ai-intent.types';
import { ClientsService } from '../clients/clients.service';
import { TASK_STATUSES } from '../tasks/dto/task-response.dto';
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
} from './telegram-format';
import { TelegramResolverService } from './telegram-resolver.service';

const MSG_DISABLED =
  'El modo conversacional no está disponible (falta configurar LM Studio). Usa /ayuda para ver los comandos.';
const MSG_UNKNOWN =
  'No entendí qué necesitas. ¿Puedes reformularlo con más detalle? También puedes usar los comandos de /ayuda.';
const MSG_ERROR =
  'No pude procesar tu mensaje con el asistente (¿LM Studio está corriendo?). Puedes usar los comandos de /ayuda.';

/**
 * Modo conversacional: interpreta texto libre del dueño con AiService y lo
 * ejecuta contra los MISMOS services de dominio que usan los comandos slash.
 * Sin lógica de negocio propia: solo validación de datos faltantes,
 * resolución de nombres y formato de respuestas.
 */
@Injectable()
export class TelegramConversationService {
  private readonly logger = new Logger(TelegramConversationService.name);

  /**
   * Último mensaje del dueño cuya intención quedó incompleta (un solo slot,
   * sin máquina de estados): el siguiente mensaje se interpreta junto a él,
   * de modo que "extiende el 12 al 2026-06-25" + "porque el cliente pidió
   * cambios" se completa en dos turnos.
   */
  private pendingText: string | null = null;

  constructor(
    private readonly aiService: AiService,
    private readonly tasksService: TasksService,
    private readonly clientsService: ClientsService,
    private readonly teamMembersService: TeamMembersService,
    private readonly resolver: TelegramResolverService,
  ) {}

  /**
   * Debe llamarse DESPUÉS de TelegramCommandsService.register(bot): así el
   * middleware de dueño ya registrado cubre también este handler, y los
   * comandos slash se procesan antes.
   */
  register(bot: Telegraf): void {
    bot.on(message('text'), async (ctx) => {
      const text = ctx.message.text.trim();
      // Los textos con "/" son comandos: nunca pasan por la IA.
      if (!text || text.startsWith('/')) return;
      try {
        await this.handle(ctx, text);
      } catch (err) {
        this.pendingText = null;
        await handleTelegramError(ctx, err, this.logger, 'el mensaje');
      }
    });
  }

  private async handle(ctx: Context, text: string): Promise<void> {
    if (!this.aiService.isEnabled()) {
      await ctx.reply(MSG_DISABLED);
      return;
    }

    // Si hay una intención incompleta previa, el nuevo mensaje puede aportar
    // solo el dato faltante: se interpretan juntos.
    const input = this.pendingText ? `${this.pendingText}\n${text}` : text;
    const result = await this.aiService.interpret(
      input,
      await this.buildContext(),
    );

    if (result.kind === 'error') {
      this.pendingText = null;
      await ctx.reply(MSG_ERROR);
      return;
    }
    if (result.kind === 'unknown') {
      this.pendingText = null;
      await ctx.reply(MSG_UNKNOWN);
      return;
    }

    const completed = await this.execute(ctx, result.intent);
    this.pendingText = completed ? null : input;
  }

  private async buildContext(): Promise<AiContext> {
    const [clients, members] = await Promise.all([
      this.clientsService.findAll({ status: 'active' }),
      this.teamMembersService.findAll({ status: 'active' }),
    ]);
    return {
      clients: clients.map((c) => ({ id: c.id, name: c.name })),
      members: members.map((m) => ({ id: m.id, name: m.name })),
      today: new Date().toISOString().slice(0, 10),
    };
  }

  /**
   * Ejecuta una intención. Devuelve true si la conversación quedó resuelta
   * (acción ejecutada o listado respondido) y false si falta información o
   * hubo ambigüedad de nombres (se conserva el texto para el siguiente turno).
   */
  private async execute(ctx: Context, intent: AiIntent): Promise<boolean> {
    switch (intent.operation) {
      case 'crear_pendiente':
        return this.crearPendiente(ctx, intent);
      case 'asignar':
        return this.asignar(ctx, intent);
      case 'reasignar':
        return this.reasignar(ctx, intent);
      case 'extender':
        return this.extender(ctx, intent);
      case 'terminar':
        return this.terminar(ctx, intent);
      case 'cambiar_estado':
        return this.cambiarEstado(ctx, intent);
      case 'listar_pendientes':
        return this.listarPendientes(ctx, intent);
      case 'listar_clientes':
        await replyHtml(
          ctx,
          formatActiveClients(
            await this.clientsService.findAll({ status: 'active' }),
          ),
        );
        return true;
      case 'listar_personas':
        await replyHtml(
          ctx,
          formatTeam(await this.teamMembersService.findAll({ status: 'all' })),
        );
        return true;
      case 'ayuda':
        await replyHtml(ctx, AYUDA);
        return true;
      case 'desconocida':
      default:
        await ctx.reply(MSG_UNKNOWN);
        return true;
    }
  }

  // ---------- intenciones que mutan ----------

  private async crearPendiente(
    ctx: Context,
    intent: Extract<AiIntent, { operation: 'crear_pendiente' }>,
  ): Promise<boolean> {
    const { clientName, title, links } = intent;
    if (!clientName || !title) {
      const missing: string[] = [];
      if (!clientName) missing.push('el cliente');
      if (!title) missing.push('el título');
      await ctx.reply(
        this.missingMessage(
          'crear el pendiente',
          missing,
          'crea un pendiente para Acme: Subir reel del viernes',
        ),
      );
      return false;
    }
    const client = await this.resolver.resolveClient(ctx, clientName);
    if (!client) return false;
    const task = await this.tasksService.create({
      clientId: client.id,
      title,
      links: links?.map((url) => ({ url })),
    });
    await replyHtml(ctx, `🆕 Pendiente creado:\n${taskBlock(task)}`);
    return true;
  }

  private async asignar(
    ctx: Context,
    intent: Extract<AiIntent, { operation: 'asignar' }>,
  ): Promise<boolean> {
    const { taskId, memberNames, dueDate } = intent;
    if (!taskId || !memberNames?.length || !dueDate) {
      const missing: string[] = [];
      if (!taskId) missing.push('el ID del pendiente');
      if (!memberNames?.length) missing.push('la persona o personas');
      if (!dueDate) missing.push('la fecha de entrega');
      await ctx.reply(
        this.missingMessage(
          this.taskAction('asignar', taskId),
          missing,
          'asigna el 12 a Ana y Luis para el 2026-06-20',
        ),
      );
      return false;
    }
    const members = await this.resolver.resolveMembers(ctx, memberNames);
    if (!members) return false;
    const task = await this.tasksService.assign(taskId, {
      memberIds: members.map((m) => m.id),
      dueDate: parseDateToIso(dueDate),
    });
    await replyHtml(ctx, `📌 Pendiente asignado:\n${taskBlock(task)}`);
    return true;
  }

  private async reasignar(
    ctx: Context,
    intent: Extract<AiIntent, { operation: 'reasignar' }>,
  ): Promise<boolean> {
    const { taskId, memberNames, reason } = intent;
    if (!taskId || !memberNames?.length || !reason) {
      const missing: string[] = [];
      if (!taskId) missing.push('el ID del pendiente');
      if (!memberNames?.length) missing.push('la persona o personas');
      if (!reason) missing.push('la razón');
      await ctx.reply(
        this.missingMessage(
          this.taskAction('reasignar', taskId),
          missing,
          'reasigna el 12 a Marta porque Ana está de vacaciones',
        ),
      );
      return false;
    }
    const members = await this.resolver.resolveMembers(ctx, memberNames);
    if (!members) return false;
    const task = await this.tasksService.reassign(taskId, {
      memberIds: members.map((m) => m.id),
      reason,
    });
    await replyHtml(ctx, `🔄 Pendiente reasignado:\n${taskBlock(task)}`);
    return true;
  }

  private async extender(
    ctx: Context,
    intent: Extract<AiIntent, { operation: 'extender' }>,
  ): Promise<boolean> {
    const { taskId, newDueDate, reason } = intent;
    if (!taskId || !newDueDate || !reason) {
      const missing: string[] = [];
      if (!taskId) missing.push('el ID del pendiente');
      if (!newDueDate) missing.push('la nueva fecha de entrega');
      if (!reason) missing.push('la razón');
      await ctx.reply(
        this.missingMessage(
          this.taskAction('extender', taskId),
          missing,
          'extiende el 12 al 2026-06-25 porque el cliente pidió cambios',
        ),
      );
      return false;
    }
    const task = await this.tasksService.extend(taskId, {
      newDueDate: parseDateToIso(newDueDate),
      reason,
    });
    await replyHtml(ctx, `⏳ Pendiente extendido:\n${taskBlock(task)}`);
    return true;
  }

  private async terminar(
    ctx: Context,
    intent: Extract<AiIntent, { operation: 'terminar' }>,
  ): Promise<boolean> {
    const { taskId } = intent;
    if (!taskId) {
      await ctx.reply(
        this.missingMessage(
          'terminar un pendiente',
          ['el ID del pendiente'],
          'termina el 12',
        ),
      );
      return false;
    }
    const task = await this.tasksService.complete(taskId);
    await replyHtml(ctx, `✅ Pendiente terminado:\n${taskBlock(task)}`);
    return true;
  }

  private async cambiarEstado(
    ctx: Context,
    intent: Extract<AiIntent, { operation: 'cambiar_estado' }>,
  ): Promise<boolean> {
    const { taskId, status, reason } = intent;
    if (!taskId || !status) {
      const missing: string[] = [];
      if (!taskId) missing.push('el ID del pendiente');
      if (!status) {
        missing.push(`el estado (${TASK_STATUSES.join(', ')})`);
      }
      await ctx.reply(
        this.missingMessage(
          this.taskAction('cambiar de estado', taskId),
          missing,
          'pasa el 12 a TERMINADO',
        ),
      );
      return false;
    }
    if (status === 'EXTENDIDO' && !reason) {
      await ctx.reply(
        `Para pasar el pendiente #${taskId} a EXTENDIDO necesito la razón. ` +
          `Dímelo así: "pasa el ${taskId} a EXTENDIDO porque el cliente pidió cambios".`,
      );
      return false;
    }
    const task = await this.tasksService.changeStatus(taskId, {
      status,
      reason: reason || undefined,
    });
    await replyHtml(
      ctx,
      `${STATUS_EMOJI[task.status] ?? ''} Estado actualizado:\n${taskBlock(task)}`,
    );
    return true;
  }

  // ---------- intenciones de consulta ----------

  private async listarPendientes(
    ctx: Context,
    intent: Extract<AiIntent, { operation: 'listar_pendientes' }>,
  ): Promise<boolean> {
    let clientId: number | undefined;
    let title = 'Pendientes abiertos';
    if (intent.clientName) {
      const client = await this.resolver.resolveClient(ctx, intent.clientName);
      if (!client) return false;
      clientId = client.id;
      title = `Pendientes abiertos de ${escapeHtml(client.name)}`;
    }
    const tasks = (await this.tasksService.findAll({ clientId })).filter(
      (t) => t.status !== 'TERMINADO',
    );
    await replyHtml(ctx, formatOpenTasks(title, tasks));
    return true;
  }

  // ---------- helpers ----------

  private taskAction(verb: string, taskId?: number): string {
    return taskId ? `${verb} el pendiente #${taskId}` : `${verb} un pendiente`;
  }

  private missingMessage(
    action: string,
    missing: string[],
    example: string,
  ): string {
    const list =
      missing.length === 1
        ? missing[0]
        : `${missing.slice(0, -1).join(', ')} y ${missing[missing.length - 1]}`;
    return `Para ${action} me falta ${list}. Dímelo así: "${example}".`;
  }
}
