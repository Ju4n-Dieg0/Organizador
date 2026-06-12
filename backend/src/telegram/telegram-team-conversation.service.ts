import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Context, Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { AiTeamContext, AiTeamIntent } from '../ai/ai-intent.types';
import { AiService } from '../ai/ai.service';
import { ClientResponseDto } from '../clients/dto/client-response.dto';
import { ClientsService } from '../clients/clients.service';
import {
  CreateTeamRequestInput,
  RequestsService,
} from '../requests/requests.service';
import { TaskResponseDto, TaskStatus } from '../tasks/dto/task-response.dto';
import { TaskCommentsService } from '../tasks/task-comments.service';
import { TasksService } from '../tasks/tasks.service';
import { TeamMemberResponseDto } from '../team-members/dto/team-member-response.dto';
import { TeamMembersService } from '../team-members/team-members.service';
import {
  AFFIRMATIONS,
  CANCELS,
  DRAFT_TTL_MS,
  extractLocalDate,
  localIsoDate,
  normalizeReply,
} from './telegram-conversation.service';
import {
  TeamConversationDraft,
  TeamDraftAwaiting,
} from './telegram-draft.types';
import {
  escapeHtml,
  formatOpenTasks,
  handleTelegramError,
  httpMessage,
  humanList,
  replyHtml,
  taskBlock,
  UsageError,
} from './telegram-format';
import {
  normalizeName,
  TelegramResolverService,
} from './telegram-resolver.service';

const MSG_DISABLED =
  'Ahora mismo no puedo interpretar mensajes (el asistente de IA no está disponible). Inténtalo más tarde o avísale al administrador.';
const MSG_ERROR =
  'Ahora mismo no puedo interpretar mensajes: el asistente de IA no responde. Inténtalo de nuevo en un rato, por favor.';

/** Respuestas que descartan la fecha propuesta en `assignee-or-skip`. */
const SKIP_ASSIGNEE = new Set([
  'no',
  'no se',
  'nose',
  'no lo se',
  'nadie',
  'aun no',
  'todavia no',
  'ninguno',
  'ninguna',
]);

/** Estados aceptados como respuesta a «¿a qué estado…?». */
const STATUS_WORDS: Record<string, TaskStatus> = {
  pendiente: 'PENDIENTE',
  asignado: 'ASIGNADO',
  extendido: 'EXTENDIDO',
  terminado: 'TERMINADO',
};

/** Días de la semana (índice = Date.getDay()) para fechas relativas. */
const WEEKDAYS = [
  'domingo',
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
];

/**
 * Fecha local sin LLM para respuestas de seguimiento: YYYY-MM-DD,
 * "hoy"/"mañana"/"pasado mañana" o un día de la semana (próxima ocurrencia).
 */
function parseTeamDate(text: string): string | null {
  const local = extractLocalDate(text);
  if (local) return local;
  const norm = normalizeReply(text);
  for (let day = 0; day < WEEKDAYS.length; day++) {
    if (norm.includes(WEEKDAYS[day])) {
      const date = new Date();
      const diff = (day - date.getDay() + 7) % 7 || 7; // siempre a futuro
      date.setDate(date.getDate() + diff);
      return localIsoDate(date);
    }
  }
  return null;
}

interface TeamMemberRef {
  id: number;
  name: string;
}

/** Cola de intenciones en proceso para un turno de un miembro. */
interface TeamQueueState {
  chatId: string;
  member: TeamMemberRef;
  intents: AiTeamIntent[];
  myTasks: TaskResponseDto[];
}

interface TeamPause {
  awaiting: TeamDraftAwaiting;
  question: string;
}

type TeamStepResult = { kind: 'done' } | { kind: 'pause'; pause: TeamPause };

type TaskScopedIntent = Extract<
  AiTeamIntent,
  {
    operation:
      | 'terminar'
      | 'comentar'
      | 'solicitar_extension'
      | 'solicitar_reasignacion'
      | 'solicitar_cambio_estado';
  }
>;

/**
 * Modo conversacional de EQUIPO: texto libre de los chats vinculados a un
 * miembro (TeamMember.telegramChatId). Capacidades restringidas según
 * docs/SPEC.md: consultas propias/por cliente, terminar pendientes propios
 * (directo, con actor) y solicitudes que aprueba el dueño (TeamRequest).
 *
 * Se registra ANTES del middleware de solo-dueño: hace next() para el dueño
 * y para chats desconocidos (cero cambio de comportamiento para ellos).
 * Cero lógica de negocio propia: todo pasa por los services de dominio.
 */
@Injectable()
export class TelegramTeamConversationService {
  private readonly logger = new Logger(TelegramTeamConversationService.name);

  /** Borrador multi-turno por chat de miembro (clave: chatId). */
  private readonly drafts = new Map<string, TeamConversationDraft>();

  constructor(
    private readonly config: ConfigService,
    private readonly aiService: AiService,
    private readonly tasksService: TasksService,
    private readonly taskCommentsService: TaskCommentsService,
    private readonly clientsService: ClientsService,
    private readonly teamMembersService: TeamMembersService,
    private readonly requestsService: RequestsService,
    private readonly resolver: TelegramResolverService,
  ) {}

  /**
   * Debe llamarse DESPUÉS de TelegramLinkService.register (para que /start
   * con token siga vinculando) y ANTES de TelegramCommandsService.register
   * (el middleware de solo-dueño vive ahí; este handler hace next() para
   * todo chat que no sea de un miembro vinculado activo).
   */
  register(bot: Telegraf): void {
    bot.on(message('text'), async (ctx, next) => {
      const chatId = ctx.chat ? String(ctx.chat.id) : '';
      const ownerChatId =
        this.config.get<string>('TELEGRAM_OWNER_CHAT_ID') ?? '';
      if (!chatId || (ownerChatId && chatId === ownerChatId)) {
        await next();
        return;
      }
      const member = await this.findLinkedMember(chatId);
      if (!member) {
        await next();
        return;
      }

      const text = ctx.message.text.trim();
      try {
        if (text.startsWith('/')) {
          // /start con token nunca llega aquí (lo maneja TelegramLinkService).
          await this.slashNotice(ctx, member);
          return;
        }
        if (!text) return;
        await this.handle(ctx, chatId, member, text);
      } catch (err) {
        // Errores de negocio no destruyen el borrador (se puede reintentar);
        // los inesperados sí, para no dejar el chat en un estado roto.
        if (!(err instanceof UsageError) && !(err instanceof HttpException)) {
          this.drafts.delete(chatId);
        }
        await handleTelegramError(ctx, err, this.logger, 'el mensaje');
      }
    });
  }

  /** Miembro ACTIVO vinculado a este chat, o null. */
  private async findLinkedMember(chatId: string): Promise<TeamMemberRef | null> {
    const members = await this.teamMembersService.findAllInternal();
    const member = members.find(
      (m) => m.active && m.telegramChatId === chatId,
    );
    return member ? { id: member.id, name: member.name } : null;
  }

  private async slashNotice(ctx: Context, member: TeamMemberRef): Promise<void> {
    await ctx.reply(
      `Hola, ${member.name} 👋 Conmigo no necesitas comandos: escríbeme normal y yo me encargo. Por ejemplo:\n` +
        '• «¿qué pendientes tengo?»\n' +
        '• «ya terminé el reel de mayo»\n' +
        '• «necesito más tiempo para el informe, hasta el viernes, porque faltan datos»',
    );
  }

  // ---------- flujo principal ----------

  private async handle(
    ctx: Context,
    chatId: string,
    member: TeamMemberRef,
    text: string,
  ): Promise<void> {
    if (!this.aiService.isEnabled()) {
      await ctx.reply(MSG_DISABLED);
      return;
    }
    let draft = this.drafts.get(chatId);
    if (draft && Date.now() - draft.createdAt > DRAFT_TTL_MS) {
      this.drafts.delete(chatId);
      draft = undefined;
    }
    const normalized = normalizeReply(text);
    if (draft && CANCELS.has(normalized)) {
      this.drafts.delete(chatId);
      await ctx.reply('Hecho, lo dejamos ahí. Cuando quieras lo retomamos.');
      return;
    }
    if (draft) {
      await this.resume(ctx, chatId, member, draft, text, normalized);
      return;
    }

    const myTasks = await this.loadMyTasks(member.id);
    const result = await this.aiService.interpretTeam(
      text,
      await this.buildContext(member, myTasks),
    );
    switch (result.kind) {
      case 'error':
        await ctx.reply(MSG_ERROR);
        return;
      case 'smalltalk':
        await ctx.reply(this.smalltalkReply(member));
        return;
      case 'unknown':
        await ctx.reply(this.unknownReply(text));
        return;
      case 'intents':
        await this.processQueue(ctx, {
          chatId,
          member,
          intents: [...result.intents],
          myTasks,
        });
    }
  }

  /** Pendientes ABIERTOS asignados al miembro (alcance de sus acciones). */
  private async loadMyTasks(memberId: number): Promise<TaskResponseDto[]> {
    const tasks = await this.tasksService.findAll({ memberId });
    return tasks.filter((t) => t.status !== 'TERMINADO');
  }

  private async buildContext(
    member: TeamMemberRef,
    myTasks: TaskResponseDto[],
  ): Promise<AiTeamContext> {
    const [clients, members] = await Promise.all([
      this.clientsService.findAll({ status: 'active' }),
      this.teamMembersService.findAll({ status: 'active' }),
    ]);
    return {
      memberName: member.name,
      clients: clients.map((c) => ({ id: c.id, name: c.name })),
      members: members.map((m) => ({ id: m.id, name: m.name })),
      myTasks: myTasks.map((t) => ({
        id: t.id,
        title: t.title,
        clientName: t.client.name,
        status: t.status,
        dueDate: t.dueDate,
      })),
      today: localIsoDate(new Date()),
    };
  }

  private smalltalkReply(member: TeamMemberRef): string {
    const options = [
      `¡Hola, ${member.name}! Puedo decirte qué pendientes tienes, mostrarte los de un cliente, marcar como terminado lo que ya entregaste o enviar una solicitud al administrador (más tiempo, reasignar, pendiente nuevo). ¿Qué necesitas?`,
      `¡Hey, ${member.name}! Aquí estoy. Pregúntame por tus pendientes o los de un cliente, dime si ya terminaste algo, o pídeme más tiempo o una reasignación y se lo solicito al administrador.`,
    ];
    return options[Math.floor(Math.random() * options.length)];
  }

  private helpReply(member: TeamMemberRef): string {
    return [
      `Esto es lo que puedo hacer por ti, ${member.name}:`,
      '• Decirte tus pendientes: «¿qué tengo pendiente?»',
      '• Mostrarte los de un cliente: «¿qué hay de Acme?»',
      '• Marcar como terminado lo que entregaste: «ya terminé el reel»',
      '• Dejar un comentario en un pendiente tuyo (les llega al administrador y a los demás asignados): «sobre el reel: el cliente aún no manda el logo»',
      '• Enviar solicitudes al administrador (él las aprueba o rechaza y yo te aviso):',
      '   – más tiempo: «necesito más tiempo para X, hasta el viernes, porque…»',
      '   – pasar una tarea: «pásale X a Luis porque…»',
      '   – pendiente nuevo: «hay que crear un pendiente de Y para Acme»',
      '   – cambiar un estado: «pasa X a extendido porque…»',
    ].join('\n');
  }

  private unknownReply(text: string): string {
    const quoted = text.length > 90 ? `${text.slice(0, 87)}…` : text;
    return (
      `Mmm, no estoy seguro de qué hacer con «${quoted}». Puedo contarte tus pendientes o los de un cliente, ` +
      'marcar como terminado algo que entregaste, o enviar una solicitud al administrador ' +
      '(más tiempo, reasignación, pendiente nuevo). ¿Me lo dices de otra forma?'
    );
  }

  // ---------- reanudación del borrador ----------

  private async resume(
    ctx: Context,
    chatId: string,
    member: TeamMemberRef,
    draft: TeamConversationDraft,
    text: string,
    normalized: string,
  ): Promise<void> {
    const state: TeamQueueState = {
      chatId,
      member,
      intents: draft.intents,
      myTasks: draft.myTasks,
    };
    const intent = draft.intents[0];
    const awaiting = draft.awaiting;
    // Se borra; si la cola vuelve a pausar, processQueue lo re-crea.
    this.drafts.delete(chatId);

    const repause = async (
      next: TeamDraftAwaiting,
      question: string,
    ): Promise<void> => {
      this.drafts.set(chatId, {
        ...draft,
        createdAt: Date.now(),
        awaiting: next,
      });
      await ctx.reply(question);
    };

    switch (awaiting.kind) {
      case 'task-confirm': {
        if (AFFIRMATIONS.has(normalized)) {
          this.applyTask(intent, awaiting.task.id);
          await this.processQueue(ctx, state);
          return;
        }
        if (normalized === 'no') {
          await repause(
            { kind: 'task-pick' },
            `Vale. ¿A cuál de tus pendientes te refieres?\n${this.ownTaskLines(state.myTasks)}`,
          );
          return;
        }
        // "no, el otro reel" o directamente el título correcto.
        const candidate = /^no[\s,]/i.test(text)
          ? text.replace(/^no[\s,]+/i, '')
          : text;
        this.applyTaskRef(intent, candidate);
        await this.processQueue(ctx, state);
        return;
      }
      case 'task-pick':
        this.applyTaskRef(intent, text);
        await this.processQueue(ctx, state);
        return;
      case 'client-confirm': {
        if (AFFIRMATIONS.has(normalized)) {
          this.applyClientName(intent, awaiting.clientName);
          await this.processQueue(ctx, state);
          return;
        }
        if (normalized === 'no') {
          await repause(
            { kind: 'client-name' },
            'Vale. ¿Cuál es el cliente entonces?',
          );
          return;
        }
        const candidate = /^no[\s,]/i.test(text)
          ? text.replace(/^no[\s,]+/i, '')
          : text;
        this.applyClientName(intent, candidate);
        await this.processQueue(ctx, state);
        return;
      }
      case 'client-name': {
        if (!text.trim()) {
          await repause(awaiting, '¿Me repites el nombre del cliente?');
          return;
        }
        this.applyClientName(intent, text);
        await this.processQueue(ctx, state);
        return;
      }
      case 'member-confirm': {
        if (AFFIRMATIONS.has(normalized)) {
          this.applyMemberName(intent, awaiting.query, awaiting.memberName);
          await this.processQueue(ctx, state);
          return;
        }
        if (normalized === 'no') {
          await repause(
            { kind: 'member-name', query: awaiting.query },
            'Vale. ¿Quién es entonces?',
          );
          return;
        }
        const candidate = /^no[\s,]/i.test(text)
          ? text.replace(/^no[\s,]+/i, '')
          : text;
        this.applyMemberName(intent, awaiting.query, candidate);
        await this.processQueue(ctx, state);
        return;
      }
      case 'member-name': {
        if (!text.trim()) {
          await repause(awaiting, '¿Me repites el nombre?');
          return;
        }
        this.applyMemberName(intent, awaiting.query, text);
        await this.processQueue(ctx, state);
        return;
      }
      case 'assignee-or-skip': {
        if (intent?.operation === 'solicitar_pendiente') {
          if (SKIP_ASSIGNEE.has(normalized)) {
            intent.dueDate = undefined; // sin persona no se puede proponer fecha
            await ctx.reply(
              'Vale, envío la solicitud sin fecha propuesta (la decidirá el administrador al asignarla).',
            );
          } else {
            intent.memberNames = [text.trim()];
          }
        }
        await this.processQueue(ctx, state);
        return;
      }
      case 'field': {
        const applied = this.applyField(intent, awaiting.field, text);
        if (applied !== null) {
          await repause(awaiting, applied);
          return;
        }
        await this.processQueue(ctx, state);
        return;
      }
      case 'confirm-send': {
        if (AFFIRMATIONS.has(normalized)) {
          await this.requestsService.create(awaiting.input);
          await ctx.reply(
            '📨 ¡Listo! Tu solicitud fue enviada al administrador. Te aviso en cuanto la resuelva.',
          );
          state.intents.shift();
          await this.processQueue(ctx, state);
          return;
        }
        if (normalized === 'no') {
          await ctx.reply('Vale, descarto esa solicitud.');
          state.intents.shift();
          await this.processQueue(ctx, state);
          return;
        }
        await repause(
          awaiting,
          `Dime «sí» para enviarla al administrador o «cancela» para descartarla.\nLo que tengo: ${awaiting.summary}`,
        );
        return;
      }
    }
  }

  /**
   * Aplica el valor literal de un campo a la intención actual.
   * Devuelve null si quedó aplicado, o la re-pregunta si el valor no sirve.
   */
  private applyField(
    intent: AiTeamIntent | undefined,
    field: 'title' | 'newDueDate' | 'dueDate' | 'reason' | 'status' | 'message',
    text: string,
  ): string | null {
    const value = text.trim();
    if (!intent) return null;
    switch (field) {
      case 'title':
        if (!value) return '¿Me repites qué hay que hacer?';
        if (intent.operation === 'solicitar_pendiente') intent.title = value;
        return null;
      case 'message':
        if (!value) return '¿Qué quieres decir? Escríbeme el comentario tal cual.';
        if (intent.operation === 'comentar') intent.message = value;
        return null;
      case 'reason':
        if (!value) return '¿Me repites la razón?';
        if (
          intent.operation === 'solicitar_extension' ||
          intent.operation === 'solicitar_reasignacion' ||
          intent.operation === 'solicitar_cambio_estado'
        ) {
          intent.reason = value;
        }
        return null;
      case 'newDueDate':
      case 'dueDate': {
        const day = parseTeamDate(value);
        if (!day) {
          return 'No logré entender la fecha. ¿Me la das como YYYY-MM-DD (ej. 2026-06-20) o algo como "mañana" o "el viernes"?';
        }
        if (intent.operation === 'solicitar_extension' && field === 'newDueDate') {
          intent.newDueDate = day;
        }
        if (intent.operation === 'solicitar_pendiente' && field === 'dueDate') {
          intent.dueDate = day;
        }
        return null;
      }
      case 'status': {
        const status = STATUS_WORDS[normalizeReply(value)];
        if (!status) {
          return 'No reconozco ese estado. Puede ser PENDIENTE, ASIGNADO, EXTENDIDO o TERMINADO. ¿Cuál es?';
        }
        if (intent.operation === 'solicitar_cambio_estado') {
          intent.status = status;
        }
        return null;
      }
    }
  }

  // ---------- mutadores de la intención actual ----------

  private isTaskScoped(intent: AiTeamIntent): intent is TaskScopedIntent {
    return (
      intent.operation === 'terminar' ||
      intent.operation === 'comentar' ||
      intent.operation === 'solicitar_extension' ||
      intent.operation === 'solicitar_reasignacion' ||
      intent.operation === 'solicitar_cambio_estado'
    );
  }

  private applyTask(intent: AiTeamIntent | undefined, taskId: number): void {
    if (intent && this.isTaskScoped(intent)) {
      intent.taskId = taskId;
      intent.taskRef = undefined;
    }
  }

  private applyTaskRef(intent: AiTeamIntent | undefined, ref: string): void {
    if (intent && this.isTaskScoped(intent)) {
      intent.taskRef = ref.trim();
      intent.taskId = undefined;
    }
  }

  private applyClientName(
    intent: AiTeamIntent | undefined,
    name: string,
  ): void {
    if (
      intent &&
      (intent.operation === 'pendientes_cliente' ||
        intent.operation === 'solicitar_pendiente')
    ) {
      intent.clientName = name.trim();
    }
  }

  private applyMemberName(
    intent: AiTeamIntent | undefined,
    query: string,
    name: string,
  ): void {
    if (
      !intent ||
      (intent.operation !== 'solicitar_reasignacion' &&
        intent.operation !== 'solicitar_pendiente')
    ) {
      return;
    }
    const names = intent.memberNames ?? [];
    const key = normalizeName(query);
    const idx = key
      ? names.findIndex((n) => normalizeName(n) === key)
      : -1;
    if (idx >= 0) names[idx] = name.trim();
    else names.push(name.trim());
    intent.memberNames = names;
  }

  // ---------- procesamiento de la cola ----------

  private async processQueue(
    ctx: Context,
    state: TeamQueueState,
  ): Promise<void> {
    while (state.intents.length > 0) {
      const intent = state.intents[0];
      let result: TeamStepResult;
      try {
        result = await this.step(ctx, state, intent);
      } catch (err) {
        if (err instanceof UsageError || err instanceof HttpException) {
          const msg =
            err instanceof UsageError ? err.message : httpMessage(err);
          state.intents.shift();
          await ctx.reply(
            `⚠️ ${msg}${state.intents.length > 0 ? '\nSigo con lo siguiente.' : ''}`,
          );
          continue;
        }
        throw err;
      }
      if (result.kind === 'pause') {
        this.drafts.set(state.chatId, {
          createdAt: Date.now(),
          intents: [...state.intents],
          myTasks: state.myTasks,
          awaiting: result.pause.awaiting,
        });
        await ctx.reply(result.pause.question);
        return;
      }
      state.intents.shift();
    }
    this.drafts.delete(state.chatId);
  }

  private async step(
    ctx: Context,
    state: TeamQueueState,
    intent: AiTeamIntent,
  ): Promise<TeamStepResult> {
    switch (intent.operation) {
      case 'mis_pendientes':
        await replyHtml(
          ctx,
          formatOpenTasks('Tus pendientes abiertos', state.myTasks),
        );
        return { kind: 'done' };
      case 'pendientes_cliente':
        return this.pendientesCliente(ctx, intent);
      case 'terminar':
        return this.terminar(ctx, state, intent);
      case 'comentar':
        return this.comentar(ctx, state, intent);
      case 'solicitar_extension':
        return this.solicitarExtension(state, intent);
      case 'solicitar_reasignacion':
        return this.solicitarReasignacion(state, intent);
      case 'solicitar_cambio_estado':
        return this.solicitarCambioEstado(ctx, state, intent);
      case 'solicitar_pendiente':
        return this.solicitarPendiente(state, intent);
      case 'ayuda':
        await ctx.reply(this.helpReply(state.member));
        return { kind: 'done' };
      case 'charla':
        // Filtrada por ai/ cuando viene mezclada; sin acción si llega sola.
        return { kind: 'done' };
      case 'desconocida':
      default:
        await ctx.reply(this.unknownReply(''));
        return { kind: 'done' };
    }
  }

  // ---------- resolución de tarea/cliente/personas con pausas ----------

  /** Líneas planas (sin HTML) con los pendientes del miembro. */
  private ownTaskLines(tasks: TaskResponseDto[]): string {
    return tasks
      .map((t) => `• ${t.title} (${t.client.name})`)
      .join('\n');
  }

  /**
   * Resuelve la tarea de una intención dentro de las del MIEMBRO (alcance
   * obligatorio): taskId solo se acepta si está entre sus pendientes
   * abiertos; taskRef se resuelve por fuzzy con confirmación.
   */
  private resolveTaskFor(
    state: TeamQueueState,
    intent: TaskScopedIntent,
    verb: string,
  ): { task?: TaskResponseDto; pause?: TeamPause } {
    const open = state.myTasks;
    if (open.length === 0) {
      throw new UsageError(
        'No tienes pendientes abiertos asignados a ti ahora mismo, así que no hay nada que pueda hacer con eso.',
      );
    }
    if (intent.taskId !== undefined) {
      const own = open.find((t) => t.id === intent.taskId);
      if (own) return { task: own };
      // id inventado o fuera de su alcance: se resuelve por texto.
    }
    const ref = intent.taskRef?.trim();
    if (!ref) {
      return {
        pause: {
          awaiting: { kind: 'task-pick' },
          question: `¿Cuál de tus pendientes quieres ${verb}?\n${this.ownTaskLines(open)}`,
        },
      };
    }
    const res = this.resolver.findTaskByTitle(ref, open);
    switch (res.kind) {
      case 'match':
        return { task: res.entity };
      case 'suggestion':
        return {
          pause: {
            awaiting: { kind: 'task-confirm', query: ref, task: res.entity },
            question: `¿Te refieres a «${res.entity.title}» (${res.entity.client.name})?`,
          },
        };
      case 'ambiguous':
        return {
          pause: {
            awaiting: { kind: 'task-pick' },
            question: `Tienes varios pendientes que encajan con «${ref}». ¿Cuál de estos?\n${this.ownTaskLines(res.options)}`,
          },
        };
      case 'none':
        return {
          pause: {
            awaiting: { kind: 'task-pick' },
            question: `No encuentro «${ref}» entre tus pendientes abiertos. Estos son:\n${this.ownTaskLines(open)}\n¿A cuál te refieres?`,
          },
        };
    }
  }

  private async resolveClientFor(
    name: string,
    noneQuestion: string,
  ): Promise<{ client?: ClientResponseDto; pause?: TeamPause }> {
    const res = await this.resolver.findClient(name);
    switch (res.kind) {
      case 'match':
        return { client: res.entity };
      case 'suggestion':
        return {
          pause: {
            awaiting: {
              kind: 'client-confirm',
              query: name,
              clientName: res.entity.name,
            },
            question: `No tengo un cliente «${name}» tal cual. ¿Te refieres a «${res.entity.name}»?`,
          },
        };
      case 'ambiguous':
        return {
          pause: {
            awaiting: { kind: 'client-name' },
            question: `Hay varios clientes que encajan con «${name}». ¿Cuál de estos: ${res.options.map((o) => o.name).join(', ')}?`,
          },
        };
      case 'none':
        return {
          pause: {
            awaiting: { kind: 'client-name' },
            question: noneQuestion,
          },
        };
    }
  }

  private async resolveMembersFor(
    names: string[],
  ): Promise<{ members?: TeamMemberResponseDto[]; pause?: TeamPause }> {
    const resolved: TeamMemberResponseDto[] = [];
    for (const raw of names) {
      const name = raw.trim();
      if (!name) continue;
      const res = await this.resolver.findMember(name);
      switch (res.kind) {
        case 'match':
          resolved.push(res.entity);
          break;
        case 'suggestion':
          return {
            pause: {
              awaiting: {
                kind: 'member-confirm',
                query: name,
                memberName: res.entity.name,
              },
              question: `No tengo a «${name}» tal cual en el equipo. ¿Te refieres a «${res.entity.name}»?`,
            },
          };
        case 'ambiguous':
          return {
            pause: {
              awaiting: { kind: 'member-name', query: name },
              question: `Hay varias personas que encajan con «${name}». ¿Cuál de estas: ${res.options.map((o) => o.name).join(', ')}?`,
            },
          };
        case 'none':
          return {
            pause: {
              awaiting: { kind: 'member-name', query: name },
              question: `No encuentro a nadie del equipo llamado «${name}». ¿A quién te refieres?`,
            },
          };
      }
    }
    return {
      members: resolved.filter(
        (m, i) => resolved.findIndex((x) => x.id === m.id) === i,
      ),
    };
  }

  // ---------- consultas ----------

  private async pendientesCliente(
    ctx: Context,
    intent: Extract<AiTeamIntent, { operation: 'pendientes_cliente' }>,
  ): Promise<TeamStepResult> {
    const name = intent.clientName?.trim();
    if (!name) {
      return {
        kind: 'pause',
        pause: {
          awaiting: { kind: 'client-name' },
          question: '¿De qué cliente quieres ver los pendientes?',
        },
      };
    }
    const res = await this.resolveClientFor(
      name,
      `No encuentro un cliente llamado «${name}». ¿De qué cliente quieres ver los pendientes?`,
    );
    if (res.pause) return { kind: 'pause', pause: res.pause };
    const client = res.client as ClientResponseDto;
    intent.clientName = client.name;
    const tasks = (
      await this.tasksService.findAll({ clientId: client.id })
    ).filter((t) => t.status !== 'TERMINADO');
    await replyHtml(
      ctx,
      formatOpenTasks(
        `Pendientes abiertos de ${escapeHtml(client.name)}`,
        tasks,
      ),
    );
    return { kind: 'done' };
  }

  // ---------- terminar (directo, con actor) ----------

  private async terminar(
    ctx: Context,
    state: TeamQueueState,
    intent: Extract<AiTeamIntent, { operation: 'terminar' }>,
  ): Promise<TeamStepResult> {
    const res = this.resolveTaskFor(state, intent, 'dar por terminado');
    if (res.pause) return { kind: 'pause', pause: res.pause };
    const task = res.task as TaskResponseDto;
    this.applyTask(intent, task.id);
    const updated = await this.tasksService.complete(task.id, {
      memberId: state.member.id,
      memberName: state.member.name,
    });
    state.myTasks = state.myTasks.filter((t) => t.id !== task.id);
    await replyHtml(
      ctx,
      `✅ ¡Bien ahí! Marqué como terminado:\n${taskBlock(updated)}\n\nEl administrador ya quedó avisado.`,
    );
    return { kind: 'done' };
  }

  // ---------- comentar (directo, sin aprobación) ----------

  /**
   * Comentario directo sobre un pendiente PROPIO (mismo alcance que
   * terminar). La notificación (dueño + demás asignados con chat, nunca el
   * autor) la envía TaskCommentsService: aquí solo se confirma al autor
   * mencionando a quiénes les llegó de verdad.
   */
  private async comentar(
    ctx: Context,
    state: TeamQueueState,
    intent: Extract<AiTeamIntent, { operation: 'comentar' }>,
  ): Promise<TeamStepResult> {
    const res = this.resolveTaskFor(state, intent, 'comentar');
    if (res.pause) return { kind: 'pause', pause: res.pause };
    const task = res.task as TaskResponseDto;
    this.applyTask(intent, task.id);

    const message = intent.message?.trim();
    if (!message) {
      return this.pauseField(
        'message',
        `¿Qué quieres decir sobre «${task.title}»? Escríbeme el comentario tal cual y se lo paso.`,
      );
    }

    await this.taskCommentsService.add(
      task.id,
      { type: 'MIEMBRO', memberId: state.member.id },
      message,
    );

    const internal = await this.teamMembersService.findAllInternal();
    const linkedIds = new Set(
      internal.filter((m) => m.telegramChatId).map((m) => m.id),
    );
    const others = task.assignees
      .filter((a) => a.memberId !== state.member.id && linkedIds.has(a.memberId))
      .map((a) => a.name);
    const recipients =
      others.length > 0
        ? `al administrador y a ${humanList(others)}`
        : 'al administrador';
    await ctx.reply(
      `💬 ¡Listo! Le pasé tu comentario ${recipients}. Quedó guardado en «${task.title}» (${task.client.name}).`,
    );
    return { kind: 'done' };
  }

  // ---------- solicitudes (requieren aprobación del dueño) ----------

  private pauseConfirmSend(
    input: CreateTeamRequestInput,
    summary: string,
  ): TeamStepResult {
    return {
      kind: 'pause',
      pause: {
        awaiting: { kind: 'confirm-send', input, summary },
        question: `Esto es lo que entendí: quieres ${summary}\n\n¿Envío la solicitud al administrador? («sí» la envía, «cancela» la descarta)`,
      },
    };
  }

  private pauseField(
    field: 'title' | 'newDueDate' | 'dueDate' | 'reason' | 'status' | 'message',
    question: string,
  ): TeamStepResult {
    return { kind: 'pause', pause: { awaiting: { kind: 'field', field }, question } };
  }

  private solicitarExtension(
    state: TeamQueueState,
    intent: Extract<AiTeamIntent, { operation: 'solicitar_extension' }>,
  ): TeamStepResult {
    const res = this.resolveTaskFor(state, intent, 'extender');
    if (res.pause) return { kind: 'pause', pause: res.pause };
    const task = res.task as TaskResponseDto;
    this.applyTask(intent, task.id);

    if (!intent.newDueDate) {
      return this.pauseField(
        'newDueDate',
        `¿Hasta qué fecha necesitas «${task.title}»? Dímela como YYYY-MM-DD (ej. 2026-06-20) o algo como "mañana" o "el viernes".`,
      );
    }
    const reason = intent.reason?.trim();
    if (!reason) {
      return this.pauseField(
        'reason',
        `¿Y cuál es la razón para pedir más tiempo con «${task.title}»? El administrador la verá junto a la solicitud.`,
      );
    }
    const input: CreateTeamRequestInput = {
      type: 'EXTENSION',
      requesterId: state.member.id,
      taskId: task.id,
      payload: { newDueDate: intent.newDueDate, reason },
    };
    return this.pauseConfirmSend(
      input,
      `pedir extender «${task.title}» (${task.client.name}) hasta el ${intent.newDueDate}. Razón: ${reason}.`,
    );
  }

  private async solicitarReasignacion(
    state: TeamQueueState,
    intent: Extract<AiTeamIntent, { operation: 'solicitar_reasignacion' }>,
  ): Promise<TeamStepResult> {
    const res = this.resolveTaskFor(state, intent, 'pasar a otra persona');
    if (res.pause) return { kind: 'pause', pause: res.pause };
    const task = res.task as TaskResponseDto;
    this.applyTask(intent, task.id);

    const names = (intent.memberNames ?? []).map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) {
      return {
        kind: 'pause',
        pause: {
          awaiting: { kind: 'member-name', query: '' },
          question: `¿A quién del equipo quieres pasarle «${task.title}»?`,
        },
      };
    }
    const membersRes = await this.resolveMembersFor(names);
    if (membersRes.pause) return { kind: 'pause', pause: membersRes.pause };
    const members = membersRes.members as TeamMemberResponseDto[];
    intent.memberNames = members.map((m) => m.name);
    const namesText = humanList(members.map((m) => m.name));

    const reason = intent.reason?.trim();
    if (!reason) {
      return this.pauseField(
        'reason',
        `¿Cuál es la razón para pasar «${task.title}» a ${namesText}? El administrador la verá junto a la solicitud.`,
      );
    }
    const input: CreateTeamRequestInput = {
      type: 'REASIGNACION',
      requesterId: state.member.id,
      taskId: task.id,
      payload: { memberIds: members.map((m) => m.id), reason },
    };
    return this.pauseConfirmSend(
      input,
      `pedir pasar «${task.title}» (${task.client.name}) a ${namesText}. Razón: ${reason}.`,
    );
  }

  private async solicitarCambioEstado(
    ctx: Context,
    state: TeamQueueState,
    intent: Extract<AiTeamIntent, { operation: 'solicitar_cambio_estado' }>,
  ): Promise<TeamStepResult> {
    // Terminar no requiere aprobación: se ejecuta directo con actor.
    if (intent.status === 'TERMINADO') {
      const replaced: Extract<AiTeamIntent, { operation: 'terminar' }> = {
        operation: 'terminar',
        taskId: intent.taskId,
        taskRef: intent.taskRef,
      };
      state.intents[0] = replaced;
      return this.terminar(ctx, state, replaced);
    }

    const res = this.resolveTaskFor(state, intent, 'cambiar de estado');
    if (res.pause) return { kind: 'pause', pause: res.pause };
    const task = res.task as TaskResponseDto;
    this.applyTask(intent, task.id);

    if (!intent.status) {
      return this.pauseField(
        'status',
        `¿A qué estado quieres pasar «${task.title}»? Puede ser PENDIENTE, ASIGNADO o EXTENDIDO (si ya está listo, dime "terminado" y lo marco directo).`,
      );
    }
    const reason = intent.reason?.trim();
    if (intent.status === 'EXTENDIDO' && !reason) {
      return this.pauseField(
        'reason',
        `Para pedir pasar «${task.title}» a EXTENDIDO necesito la razón. ¿Cuál es?`,
      );
    }
    const input: CreateTeamRequestInput = {
      type: 'CAMBIO_ESTADO',
      requesterId: state.member.id,
      taskId: task.id,
      payload: { status: intent.status, reason: reason ?? null },
    };
    return this.pauseConfirmSend(
      input,
      `pedir cambiar «${task.title}» (${task.client.name}) a ${intent.status}${reason ? `. Razón: ${reason}.` : '.'}`,
    );
  }

  private async solicitarPendiente(
    state: TeamQueueState,
    intent: Extract<AiTeamIntent, { operation: 'solicitar_pendiente' }>,
  ): Promise<TeamStepResult> {
    const title = intent.title?.trim();
    const clientName = intent.clientName?.trim();
    if (!title) {
      return this.pauseField(
        'title',
        clientName
          ? `Quieres proponer un pendiente para «${clientName}». ¿Qué hay que hacer exactamente?`
          : 'Quieres proponer un pendiente nuevo. ¿Qué hay que hacer exactamente?',
      );
    }
    if (!clientName) {
      return {
        kind: 'pause',
        pause: {
          awaiting: { kind: 'client-name' },
          question: `¿Para qué cliente sería «${title}»?`,
        },
      };
    }
    const clientRes = await this.resolveClientFor(
      clientName,
      `No encuentro un cliente llamado «${clientName}». ¿Para qué cliente es «${title}»?`,
    );
    if (clientRes.pause) return { kind: 'pause', pause: clientRes.pause };
    const client = clientRes.client as ClientResponseDto;
    intent.clientName = client.name;

    const names = (intent.memberNames ?? []).map((n) => n.trim()).filter(Boolean);
    let members: TeamMemberResponseDto[] = [];
    if (names.length > 0) {
      const membersRes = await this.resolveMembersFor(names);
      if (membersRes.pause) return { kind: 'pause', pause: membersRes.pause };
      members = membersRes.members as TeamMemberResponseDto[];
      intent.memberNames = members.map((m) => m.name);
    }

    if (intent.dueDate && members.length === 0) {
      return {
        kind: 'pause',
        pause: {
          awaiting: { kind: 'assignee-or-skip' },
          question: `Para proponer la entrega el ${intent.dueDate} necesito saber quién se encargaría. ¿Quién del equipo? (si aún no se sabe, dime «no sé» y la envío sin fecha)`,
        },
      };
    }

    const input: CreateTeamRequestInput = {
      type: 'CREAR_PENDIENTE',
      requesterId: state.member.id,
      taskId: null,
      payload: {
        clientId: client.id,
        title,
        memberIds: members.length > 0 ? members.map((m) => m.id) : undefined,
        dueDate: intent.dueDate ?? null,
      },
    };
    let summary = `proponer el pendiente «${title}» para ${client.name}`;
    if (members.length > 0) {
      summary += `, asignado a ${humanList(members.map((m) => m.name))}`;
    }
    if (intent.dueDate) {
      summary += `, con entrega el ${intent.dueDate}`;
    }
    return this.pauseConfirmSend(input, `${summary}.`);
  }
}
