import { HttpException, Injectable, Logger } from '@nestjs/common';
import { Context, Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { AiService } from '../ai/ai.service';
import { AiContext, AiIntent } from '../ai/ai-intent.types';
import { ClientResponseDto } from '../clients/dto/client-response.dto';
import { ClientsService } from '../clients/clients.service';
import {
  TASK_STATUSES,
  TaskResponseDto,
} from '../tasks/dto/task-response.dto';
import { TaskCommentsService } from '../tasks/task-comments.service';
import { TasksService } from '../tasks/tasks.service';
import { TeamMemberResponseDto } from '../team-members/dto/team-member-response.dto';
import { TeamMembersService } from '../team-members/team-members.service';
import { ConversationDraft, DraftAwaiting } from './telegram-draft.types';
import {
  AYUDA,
  escapeHtml,
  formatActiveClients,
  formatOpenTasks,
  formatTeam,
  handleTelegramError,
  httpMessage,
  humanList,
  parseDateToIso,
  replyHtml,
  STATUS_EMOJI,
  taskBlock,
  UsageError,
} from './telegram-format';
import {
  matchByName,
  normalizeName,
  TelegramResolverService,
} from './telegram-resolver.service';

const MSG_DISABLED =
  'El modo conversacional no está disponible (falta configurar LM Studio). Usa /ayuda para ver los comandos.';
const MSG_ERROR =
  'Ahora mismo no puedo interpretar mensajes: el asistente de IA no responde (¿LM Studio está corriendo?). Mientras tanto puedes usar los comandos de /ayuda.';

/** Vida útil de un borrador conversacional: ~10 minutos. */
export const DRAFT_TTL_MS = 10 * 60 * 1000;

/** Confirmaciones aceptadas (sobre texto normalizado, sin puntuación). */
export const AFFIRMATIONS = new Set([
  'si',
  'dale',
  'ok',
  'okey',
  'claro',
  'correcto',
  'exacto',
  'va',
  'vale',
  'ese',
  'esa',
  'si ese',
  'si esa',
  'si claro',
  'si dale',
  'si exacto',
  'si correcto',
  'asi es',
]);

/** Cancelaciones aceptadas en CUALQUIER estado del borrador. */
export const CANCELS = new Set([
  'cancela',
  'cancelar',
  'olvidalo',
  'dejalo',
  'mejor no',
]);

const MSG_NO_OWNER_MEMBER =
  'Aún no sé cuál miembro del equipo eres tú: márcalo en la sección Equipo de la web («Este soy yo») y vuelve a intentarlo.';

/**
 * Pronombres de primera persona (normalizados sin tildes) que el modelo
 * puede devolver como "nombre" cuando el dueño habla de sí mismo. La capa
 * telegram los resuelve de forma DETERMINISTA al miembro con isOwner antes
 * del fuzzy matching (red de seguridad del ownerMemberName del prompt).
 */
const FIRST_PERSON_PRONOUNS = new Set([
  'yo',
  'mi',
  'me',
  'a mi',
  'conmigo',
  'mio',
  'mia',
  'yo mismo',
  'yo misma',
  'mi mismo',
  'mi misma',
]);

const SMALLTALK_REPLIES = [
  '¡Hola! Aquí estoy. Puedo crear pendientes, asignarlos al equipo, mover fechas de entrega o contarte qué hay abierto. ¿Qué necesitas?',
  '¡Hey! Todo en orden por aquí. Dime si quieres crear un pendiente, asignar algo al equipo o revisar lo que está abierto.',
  '¡Hola! Cuéntame: registro pendientes de tus clientes, los asigno al equipo y te recuerdo las entregas. ¿En qué te ayudo?',
];

type CrearPendienteIntent = Extract<AiIntent, { operation: 'crear_pendiente' }>;

/** Intenciones del dueño que refieren a un pendiente EXISTENTE. */
type TaskScopedIntent = Extract<
  AiIntent,
  {
    operation:
      | 'asignar'
      | 'reasignar'
      | 'extender'
      | 'terminar'
      | 'cambiar_estado'
      | 'comentar';
  }
>;

/** Estado de procesamiento de la cola de intenciones de un turno. */
interface QueueState {
  text: string;
  intents: AiIntent[];
  clientCache: Record<string, ClientResponseDto>;
  memberCache: Record<string, TeamMemberResponseDto>;
  executedCount: number;
  /** true solo cuando `text` es el mensaje completo y nada se ha ejecutado. */
  allowFullMerge: boolean;
}

interface PauseRequest {
  awaiting: DraftAwaiting;
  question: string;
}

type StepResult = { kind: 'done' } | { kind: 'pause'; pause: PauseRequest };

/** Normaliza una respuesta corta: sin tildes, puntuación ni mayúsculas. */
export function normalizeReply(text: string): string {
  return normalizeName(text.replace(/[.,;:!¡¿?"«»'…]/g, ' '));
}

export function localIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parse local de fechas sin LLM: YYYY-MM-DD en cualquier parte del texto,
 * o "hoy" / "mañana" / "pasado mañana" calculadas localmente.
 */
export function extractLocalDate(text: string): string | null {
  const explicit = text.match(/\d{4}-\d{2}-\d{2}/);
  if (explicit) return explicit[0];
  const norm = normalizeReply(text);
  const relative: [string, number][] = [
    ['pasado manana', 2],
    ['manana', 1],
    ['hoy', 0],
  ];
  for (const [word, offset] of relative) {
    if (norm.includes(word)) {
      const date = new Date();
      date.setDate(date.getDate() + offset);
      return localIsoDate(date);
    }
  }
  return null;
}

/**
 * Modo conversacional: interpreta texto libre del dueño con AiService y lo
 * ejecuta contra los MISMOS services de dominio que usan los comandos slash.
 * Soporta varias intenciones por mensaje y conversación multi-turno mediante
 * un borrador con TTL (confirmación de nombres fuzzy, fecha pendiente de
 * asignación y reinterpretación de campos faltantes). Nunca pide IDs de
 * clientes ni personas, y los pendientes se resuelven también por título
 * (taskRef → fuzzy con confirmación); el ID sigue funcionando si lo dan.
 */
@Injectable()
export class TelegramConversationService {
  private readonly logger = new Logger(TelegramConversationService.name);

  /** Borrador multi-turno del chat del dueño (único chat que llega aquí). */
  private draft: ConversationDraft | null = null;

  constructor(
    private readonly aiService: AiService,
    private readonly tasksService: TasksService,
    private readonly taskCommentsService: TaskCommentsService,
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
        // Los errores de negocio no destruyen el borrador (el usuario puede
        // reintentar); los inesperados sí, para no quedar en un estado roto.
        if (!(err instanceof UsageError) && !(err instanceof HttpException)) {
          this.draft = null;
        }
        await handleTelegramError(ctx, err, this.logger, 'el mensaje');
      }
    });
  }

  private async handle(ctx: Context, text: string): Promise<void> {
    if (!this.aiService.isEnabled()) {
      await ctx.reply(MSG_DISABLED);
      return;
    }
    if (this.draft && Date.now() - this.draft.createdAt > DRAFT_TTL_MS) {
      this.draft = null;
    }
    const normalized = normalizeReply(text);
    if (this.draft && CANCELS.has(normalized)) {
      this.draft = null;
      await ctx.reply('Hecho, lo dejamos ahí. Cuando quieras lo retomamos.');
      return;
    }
    if (this.draft) {
      await this.resume(ctx, text, normalized);
      return;
    }

    const result = await this.aiService.interpret(
      text,
      await this.buildContext(),
    );
    switch (result.kind) {
      case 'error':
        await ctx.reply(MSG_ERROR);
        return;
      case 'smalltalk':
        await ctx.reply(
          SMALLTALK_REPLIES[Math.floor(Math.random() * SMALLTALK_REPLIES.length)],
        );
        return;
      case 'unknown':
        await ctx.reply(this.unknownReply(text));
        return;
      case 'intents':
        await this.processQueue(ctx, {
          text,
          intents: [...result.intents],
          clientCache: {},
          memberCache: {},
          executedCount: 0,
          allowFullMerge: true,
        });
    }
  }

  private unknownReply(text: string): string {
    const quoted = text.length > 90 ? `${text.slice(0, 87)}…` : text;
    return (
      `Mmm, no estoy seguro de qué hacer con «${quoted}». ¿Me lo dices de otra forma? ` +
      'Por ejemplo: "crea un pendiente para ToGrow: revisar la pauta de junio". ' +
      'Si lo prefieres, /ayuda lista los comandos.'
    );
  }

  private async buildContext(): Promise<AiContext> {
    const [clients, members, tasks] = await Promise.all([
      this.clientsService.findAll({ status: 'active' }),
      this.teamMembersService.findAll({ status: 'active' }),
      this.tasksService.findAll({}),
    ]);
    return {
      clients: clients.map((c) => ({ id: c.id, name: c.name })),
      members: members.map((m) => ({ id: m.id, name: m.name })),
      openTasks: tasks
        .filter((t) => t.status !== 'TERMINADO')
        .map((t) => ({
          id: t.id,
          title: t.title,
          clientName: t.client.name,
          status: t.status,
          dueDate: t.dueDate,
        })),
      today: new Date().toISOString().slice(0, 10),
      ownerMemberName: members.find((m) => m.isOwner)?.name,
    };
  }

  // ---------- reanudación del borrador ----------

  private async resume(
    ctx: Context,
    text: string,
    normalized: string,
  ): Promise<void> {
    const draft = this.draft as ConversationDraft;
    const awaiting = draft.awaiting;
    switch (awaiting.kind) {
      case 'confirm-client':
      case 'confirm-member': {
        const target =
          awaiting.kind === 'confirm-client' ? 'client' : 'member';
        if (AFFIRMATIONS.has(normalized)) {
          // Confirmado: se usa la entidad guardada, SIN volver al LLM.
          const key = normalizeName(awaiting.query);
          if (awaiting.kind === 'confirm-client') {
            draft.clientCache[key] = awaiting.entity;
          } else {
            draft.memberCache[key] = awaiting.entity;
          }
          this.draft = null;
          await this.processQueue(ctx, this.stateFromDraft(draft));
          return;
        }
        if (normalized === 'no') {
          draft.awaiting = { kind: 'name-fix', target, query: awaiting.query };
          draft.createdAt = Date.now();
          await ctx.reply('Vale. ¿Cuál es el nombre correcto entonces?');
          return;
        }
        // "no, ToGrow Labs" o directamente el nombre correcto.
        const candidate = /^no[\s,]/i.test(text)
          ? text.replace(/^no[\s,]+/i, '')
          : text;
        await this.applyNameFix(ctx, draft, target, awaiting.query, candidate);
        return;
      }
      case 'name-fix':
        await this.applyNameFix(
          ctx,
          draft,
          awaiting.target,
          awaiting.query,
          text,
        );
        return;
      case 'due-date':
        await this.resumeDueDate(ctx, draft, awaiting, text);
        return;
      case 'confirm-task': {
        if (AFFIRMATIONS.has(normalized)) {
          this.applyTaskToIntent(draft.intents[0], awaiting.task.id);
          this.draft = null;
          await this.processQueue(ctx, this.stateFromDraft(draft));
          return;
        }
        if (normalized === 'no') {
          draft.awaiting = { kind: 'task-fix' };
          draft.createdAt = Date.now();
          await ctx.reply(
            'Vale. ¿De qué pendiente hablamos entonces? Dime el título o el número (lo ves en /pendientes).',
          );
          return;
        }
        // "no, el otro reel" o directamente el título/número correcto.
        const candidate = /^no[\s,]/i.test(text)
          ? text.replace(/^no[\s,]+/i, '')
          : text;
        this.applyTaskRefToIntent(draft.intents[0], candidate);
        this.draft = null;
        await this.processQueue(ctx, this.stateFromDraft(draft));
        return;
      }
      case 'task-fix': {
        if (!text.trim()) {
          draft.createdAt = Date.now();
          await ctx.reply('¿Me repites el título o el número del pendiente?');
          return;
        }
        this.applyTaskRefToIntent(draft.intents[0], text);
        this.draft = null;
        await this.processQueue(ctx, this.stateFromDraft(draft));
        return;
      }
      case 'comment-text': {
        const value = text.trim();
        if (!value) {
          draft.createdAt = Date.now();
          await ctx.reply('¿Qué les digo? Escríbeme el comentario tal cual.');
          return;
        }
        const intent = draft.intents[0];
        if (intent?.operation === 'comentar') intent.message = value;
        this.draft = null;
        await this.processQueue(ctx, this.stateFromDraft(draft));
        return;
      }
      case 'reinterpret':
        await this.resumeReinterpret(ctx, draft, text);
        return;
    }
  }

  /** true si la intención refiere a un pendiente existente (taskId/taskRef). */
  private isTaskScoped(
    intent: AiIntent | undefined,
  ): intent is TaskScopedIntent {
    return (
      intent !== undefined &&
      (intent.operation === 'asignar' ||
        intent.operation === 'reasignar' ||
        intent.operation === 'extender' ||
        intent.operation === 'terminar' ||
        intent.operation === 'cambiar_estado' ||
        intent.operation === 'comentar')
    );
  }

  /** Fija el taskId resuelto en la intención actual (si aplica). */
  private applyTaskToIntent(
    intent: AiIntent | undefined,
    taskId: number,
  ): void {
    if (this.isTaskScoped(intent)) {
      intent.taskId = taskId;
      intent.taskRef = undefined;
    }
  }

  /** Aplica la referencia textual ("#12", "12" o un título) a la intención. */
  private applyTaskRefToIntent(
    intent: AiIntent | undefined,
    raw: string,
  ): void {
    if (!this.isTaskScoped(intent)) return;
    const text = raw.trim();
    const idMatch = /^#?(\d+)$/.exec(text);
    if (idMatch) {
      intent.taskId = Number.parseInt(idMatch[1], 10);
      intent.taskRef = undefined;
      return;
    }
    intent.taskRef = text;
    intent.taskId = undefined;
  }

  private stateFromDraft(
    draft: ConversationDraft,
    extraText?: string,
  ): QueueState {
    return {
      text: extraText ? `${draft.text}\n${extraText}` : draft.text,
      intents: draft.intents,
      clientCache: draft.clientCache,
      memberCache: draft.memberCache,
      executedCount: 0,
      allowFullMerge: false,
    };
  }

  private async applyNameFix(
    ctx: Context,
    draft: ConversationDraft,
    target: 'client' | 'member',
    query: string,
    rawName: string,
  ): Promise<void> {
    const name = rawName.trim();
    if (!name) {
      draft.createdAt = Date.now();
      await ctx.reply('¿Me repites el nombre?');
      return;
    }
    const intent = draft.intents[0];
    if (intent) this.applyNameToIntent(intent, target, query, name);
    this.draft = null;
    await this.processQueue(ctx, this.stateFromDraft(draft, rawName));
  }

  private applyNameToIntent(
    intent: AiIntent,
    target: 'client' | 'member',
    query: string,
    name: string,
  ): void {
    if (target === 'client') {
      if (
        intent.operation === 'crear_pendiente' ||
        intent.operation === 'listar_pendientes'
      ) {
        intent.clientName = name;
      }
      return;
    }
    if (intent.operation === 'listar_pendientes') {
      intent.memberName = name;
      return;
    }
    if (
      intent.operation === 'crear_pendiente' ||
      intent.operation === 'asignar' ||
      intent.operation === 'reasignar'
    ) {
      const names = intent.memberNames ?? [];
      const key = normalizeName(query);
      const idx = names.findIndex((n) => normalizeName(n) === key);
      if (idx >= 0) names[idx] = name;
      else names.push(name);
      intent.memberNames = names;
    }
  }

  private async resumeDueDate(
    ctx: Context,
    draft: ConversationDraft,
    awaiting: Extract<DraftAwaiting, { kind: 'due-date' }>,
    text: string,
  ): Promise<void> {
    let day = extractLocalDate(text);
    if (!day) {
      // El parse local no alcanzó: reinterpretar texto original + nuevo
      // SOLO para extraer la fecha (las intenciones re-derivadas se ignoran).
      const result = await this.aiService.interpret(
        `${draft.text}\n${text}`,
        await this.buildContext(),
      );
      if (result.kind === 'error') {
        await ctx.reply(MSG_ERROR);
        return;
      }
      if (result.kind === 'intents') day = this.findDate(result.intents);
      if (!day) {
        draft.createdAt = Date.now();
        await ctx.reply(
          'No logré entender la fecha. ¿Me la das como YYYY-MM-DD (ej. 2026-06-20) o algo como "mañana"?',
        );
        return;
      }
    }
    const dueDate = parseDateToIso(day);
    const blocks: string[] = [];
    const failures: string[] = [];
    for (const taskId of awaiting.taskIds) {
      try {
        const task = await this.tasksService.assign(taskId, {
          memberIds: awaiting.memberIds,
          dueDate,
        });
        blocks.push(taskBlock(task));
      } catch (err) {
        if (!(err instanceof UsageError) && !(err instanceof HttpException)) {
          throw err;
        }
        const msg =
          err instanceof UsageError ? err.message : httpMessage(err);
        failures.push(escapeHtml(`#${taskId}: ${msg}`));
      }
    }
    const names = escapeHtml(humanList(awaiting.memberNames));
    const parts: string[] = [];
    if (blocks.length > 0) {
      const verb = blocks.length > 1 ? 'quedan asignados' : 'queda asignado';
      parts.push(
        `📌 Listo: ${verb} a ${names} para el ${day}:\n${blocks.join('\n\n')}`,
      );
    }
    if (failures.length > 0) {
      parts.push(`⚠️ No pude asignar:\n${failures.join('\n')}`);
    }
    await replyHtml(ctx, parts.join('\n\n'));
    this.draft = null;
    if (draft.intents.length > 0) {
      await this.processQueue(ctx, this.stateFromDraft(draft, text));
    }
  }

  private findDate(intents: AiIntent[]): string | null {
    const isDay = (v: unknown): v is string =>
      typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
    for (const intent of intents) {
      if ('dueDate' in intent && isDay(intent.dueDate)) return intent.dueDate;
      if ('newDueDate' in intent && isDay(intent.newDueDate)) {
        return intent.newDueDate;
      }
    }
    return null;
  }

  private async resumeReinterpret(
    ctx: Context,
    draft: ConversationDraft,
    text: string,
  ): Promise<void> {
    const merged = `${draft.text}\n${text}`;
    const result = await this.aiService.interpret(
      merged,
      await this.buildContext(),
    );
    if (result.kind === 'error') {
      await ctx.reply(MSG_ERROR);
      return;
    }
    if (result.kind !== 'intents') {
      draft.createdAt = Date.now();
      await ctx.reply('Sigo sin tener claro ese dato. ¿Me lo dices de otra forma?');
      return;
    }
    this.draft = null;
    await this.processQueue(ctx, {
      text: merged,
      // La intención incompleta (posición 0) la re-deriva el LLM; el resto
      // de la cola guardada continúa después.
      intents: [...result.intents, ...draft.intents.slice(1)],
      clientCache: draft.clientCache,
      memberCache: draft.memberCache,
      executedCount: 0,
      allowFullMerge: draft.fullText && draft.intents.length === 1,
    });
  }

  // ---------- procesamiento de la cola de intenciones ----------

  private async processQueue(ctx: Context, state: QueueState): Promise<void> {
    while (state.intents.length > 0) {
      const intent = state.intents[0];
      let result: StepResult;
      try {
        result = await this.step(ctx, state, intent);
      } catch (err) {
        if (err instanceof UsageError || err instanceof HttpException) {
          // Error de negocio en UNA intención: se reporta y se sigue.
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
        const isFull =
          result.pause.awaiting.kind === 'reinterpret'
            ? this.canMergeFullText(state)
            : true;
        this.draft = {
          createdAt: Date.now(),
          text:
            result.pause.awaiting.kind === 'reinterpret' && !isFull
              ? this.describeIntent(state.intents[0])
              : state.text,
          fullText: isFull && state.allowFullMerge,
          intents: [...state.intents],
          clientCache: state.clientCache,
          memberCache: state.memberCache,
          awaiting: result.pause.awaiting,
        };
        await ctx.reply(result.pause.question);
        return;
      }
      state.executedCount += 1;
      state.intents.shift();
    }
    this.draft = null;
  }

  /** Solo se re-fusiona el texto completo si nada se ejecutó y la cola es 1. */
  private canMergeFullText(state: QueueState): boolean {
    return (
      state.allowFullMerge &&
      state.executedCount === 0 &&
      state.intents.length === 1
    );
  }

  private async step(
    ctx: Context,
    state: QueueState,
    intent: AiIntent,
  ): Promise<StepResult> {
    // Primera persona del dueño: resolución DETERMINISTA antes de cualquier
    // fuzzy matching. Sin miembro marcado como dueño, ESTA intención se
    // descarta con aviso y la cola sigue con las demás.
    if ((await this.resolveFirstPerson(intent)) === 'no-owner') {
      await ctx.reply(MSG_NO_OWNER_MEMBER);
      return { kind: 'done' };
    }
    switch (intent.operation) {
      case 'crear_pendiente':
        return this.crearPendiente(ctx, state, intent);
      case 'asignar':
        return this.asignar(ctx, state, intent);
      case 'reasignar':
        return this.reasignar(ctx, state, intent);
      case 'extender':
        return this.extender(ctx, state, intent);
      case 'terminar':
        return this.terminar(ctx, state, intent);
      case 'cambiar_estado':
        return this.cambiarEstado(ctx, state, intent);
      case 'comentar':
        return this.comentar(ctx, intent);
      case 'listar_pendientes':
        return this.listarPendientes(ctx, state, intent);
      case 'listar_clientes':
        await replyHtml(
          ctx,
          formatActiveClients(
            await this.clientsService.findAll({ status: 'active' }),
          ),
        );
        return { kind: 'done' };
      case 'listar_personas':
        await replyHtml(
          ctx,
          formatTeam(await this.teamMembersService.findAll({ status: 'all' })),
        );
        return { kind: 'done' };
      case 'ayuda':
        await replyHtml(ctx, AYUDA);
        return { kind: 'done' };
      case 'charla':
        // El contrato de ai/ filtra charla cuando hay otras intenciones;
        // si llega aquí, simplemente no requiere acción.
        return { kind: 'done' };
      case 'desconocida':
      default:
        await ctx.reply(this.unknownReply(state.text));
        return { kind: 'done' };
    }
  }

  private pauseReinterpret(question: string): StepResult {
    return { kind: 'pause', pause: { awaiting: { kind: 'reinterpret' }, question } };
  }

  // ---------- primera persona del dueño ----------

  /** true si el valor normalizado es un pronombre de primera persona. */
  private isFirstPerson(value: string): boolean {
    return FIRST_PERSON_PRONOUNS.has(normalizeReply(value));
  }

  /**
   * Sustituye los pronombres de primera persona («yo», «a mí», «conmigo»...)
   * de `memberNames`/`memberName` por el nombre real del miembro con
   * `isOwner` ACTIVO. Red de seguridad del `ownerMemberName` del prompt:
   * cubre cuando el modelo devuelve el pronombre literal o no hay dueño
   * marcado. Devuelve 'no-owner' si hay pronombres pero ningún miembro
   * activo está marcado como dueño.
   */
  private async resolveFirstPerson(
    intent: AiIntent,
  ): Promise<'ok' | 'no-owner'> {
    const hasListNames =
      (intent.operation === 'crear_pendiente' ||
        intent.operation === 'asignar' ||
        intent.operation === 'reasignar') &&
      (intent.memberNames ?? []).some((n) => this.isFirstPerson(n));
    const hasSingleName =
      intent.operation === 'listar_pendientes' &&
      typeof intent.memberName === 'string' &&
      this.isFirstPerson(intent.memberName);
    if (!hasListNames && !hasSingleName) return 'ok';

    const members = await this.teamMembersService.findAll({
      status: 'active',
    });
    const owner = members.find((m) => m.isOwner);
    if (!owner) return 'no-owner';

    if (
      hasListNames &&
      (intent.operation === 'crear_pendiente' ||
        intent.operation === 'asignar' ||
        intent.operation === 'reasignar')
    ) {
      const replaced = (intent.memberNames ?? []).map((n) =>
        this.isFirstPerson(n) ? owner.name : n,
      );
      intent.memberNames = replaced.filter(
        (n, i) =>
          replaced.findIndex((x) => normalizeName(x) === normalizeName(n)) ===
          i,
      );
    }
    if (hasSingleName && intent.operation === 'listar_pendientes') {
      intent.memberName = owner.name;
    }
    return 'ok';
  }

  // ---------- resolución de nombres dentro de la cola ----------

  private async resolveClientFor(
    state: QueueState,
    name: string,
    opts: {
      createIntent?: CrearPendienteIntent;
      noneQuestion: string;
    },
  ): Promise<{ client?: ClientResponseDto; pause?: PauseRequest }> {
    const key = normalizeName(name);
    const cached = state.clientCache[key];
    if (cached) return { client: cached };
    const res = await this.resolver.findClient(name);
    switch (res.kind) {
      case 'match':
        state.clientCache[key] = res.entity;
        return { client: res.entity };
      case 'suggestion':
        return {
          pause: {
            awaiting: { kind: 'confirm-client', query: name, entity: res.entity },
            question: `No tengo un cliente «${name}» tal cual. ¿Te refieres a «${res.entity.name}»?`,
          },
        };
      case 'ambiguous':
        return {
          pause: {
            awaiting: { kind: 'name-fix', target: 'client', query: name },
            question: `Hay varios clientes que encajan con «${name}». ¿Cuál de estos: ${res.options.map((o) => o.name).join(', ')}?`,
          },
        };
      case 'none': {
        if (opts.createIntent) {
          // Quizá el "cliente" es en realidad alguien del equipo.
          const member = await this.resolver.findMember(name);
          if (member.kind === 'match') {
            const memberKey = normalizeName(member.entity.name);
            state.memberCache[memberKey] = member.entity;
            const names = opts.createIntent.memberNames ?? [];
            if (!names.some((n) => normalizeName(n) === memberKey)) {
              names.push(member.entity.name);
            }
            opts.createIntent.memberNames = names;
            opts.createIntent.clientName = undefined;
            return {
              pause: {
                awaiting: { kind: 'name-fix', target: 'client', query: name },
                question: `«${member.entity.name}» es del equipo, no un cliente. ¿Para qué cliente es el pendiente?`,
              },
            };
          }
        }
        return {
          pause: {
            awaiting: { kind: 'name-fix', target: 'client', query: name },
            question: opts.noneQuestion,
          },
        };
      }
    }
  }

  private async resolveMembersFor(
    state: QueueState,
    names: string[],
  ): Promise<{ members?: TeamMemberResponseDto[]; pause?: PauseRequest }> {
    const resolved: TeamMemberResponseDto[] = [];
    for (const raw of names) {
      const name = raw.trim();
      if (!name) continue;
      const key = normalizeName(name);
      const cached = state.memberCache[key];
      if (cached) {
        resolved.push(cached);
        continue;
      }
      const res = await this.resolver.findMember(name);
      switch (res.kind) {
        case 'match':
          state.memberCache[key] = res.entity;
          resolved.push(res.entity);
          break;
        case 'suggestion':
          return {
            pause: {
              awaiting: {
                kind: 'confirm-member',
                query: name,
                entity: res.entity,
              },
              question: `No tengo a «${name}» tal cual en el equipo. ¿Te refieres a «${res.entity.name}»?`,
            },
          };
        case 'ambiguous':
          return {
            pause: {
              awaiting: { kind: 'name-fix', target: 'member', query: name },
              question: `Hay varias personas que encajan con «${name}». ¿Cuál de estas: ${res.options.map((o) => o.name).join(', ')}?`,
            },
          };
        case 'none':
          return {
            pause: {
              awaiting: { kind: 'name-fix', target: 'member', query: name },
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

  /**
   * Resuelve el pendiente de una intención que refiere a uno EXISTENTE:
   * - `taskId` explícito → findOne (404 → error de negocio que la cola
   *   reporta amable). El ID sigue funcionando siempre.
   * - `taskRef` → fuzzy por título sobre TODOS los pendientes abiertos (el
   *   dueño no tiene restricción de alcance), con confirmación «¿te refieres
   *   a…?» si es solo parecido y lista de opciones si es ambiguo. Si el
   *   título no encaja, segundo intento incluyendo el nombre del cliente
   *   («el de la notaría») degradado a confirmación.
   * - Sin ninguno → se pregunta el título o el número (el ID nunca es la
   *   única vía).
   */
  private async resolveTask(
    intent: TaskScopedIntent,
    verb: string,
  ): Promise<{ task?: TaskResponseDto; pause?: PauseRequest }> {
    if (intent.taskId) {
      return { task: await this.tasksService.findOne(intent.taskId) };
    }
    const ref = intent.taskRef?.trim();
    if (!ref) {
      return {
        pause: {
          awaiting: { kind: 'task-fix' },
          question: `¿Qué pendiente quieres ${verb}? Dime el título o el número (lo ves en /pendientes).`,
        },
      };
    }
    const open = (await this.tasksService.findAll({})).filter(
      (t) => t.status !== 'TERMINADO',
    );
    let res = this.resolver.findTaskByTitle(ref, open);
    if (res.kind === 'none') {
      // Quizá nombraron el pendiente por su cliente («el de la notaría»):
      // segundo intento sobre "título + cliente". Como el match es indirecto,
      // siempre se degrada a confirmación.
      const wrapped = open.map((task) => ({
        name: `${task.title} ${task.client.name}`,
        task,
      }));
      const byClient = matchByName(ref, wrapped);
      if (byClient.kind === 'match' || byClient.kind === 'suggestion') {
        res = { kind: 'suggestion', entity: byClient.entity.task };
      } else if (byClient.kind === 'ambiguous') {
        res = {
          kind: 'ambiguous',
          options: byClient.options.map((o) => o.task),
        };
      }
    }
    switch (res.kind) {
      case 'match':
        return { task: res.entity };
      case 'suggestion':
        return {
          pause: {
            awaiting: { kind: 'confirm-task', query: ref, task: res.entity },
            question: `¿Te refieres a «${res.entity.title}» (${res.entity.client.name})?`,
          },
        };
      case 'ambiguous':
        return {
          pause: {
            awaiting: { kind: 'task-fix' },
            question: `Hay varios pendientes que encajan con «${ref}». ¿Cuál de estos?\n${res.options
              .map((t) => `• #${t.id} ${t.title} (${t.client.name})`)
              .join('\n')}`,
          },
        };
      case 'none':
        return {
          pause: {
            awaiting: { kind: 'task-fix' },
            question: `No encuentro ningún pendiente abierto que encaje con «${ref}». ¿Me das el título exacto o el número (lo ves en /pendientes)?`,
          },
        };
    }
  }

  // ---------- intenciones que mutan ----------

  private async crearPendiente(
    ctx: Context,
    state: QueueState,
    intent: CrearPendienteIntent,
  ): Promise<StepResult> {
    const title = intent.title?.trim();
    const clientName = intent.clientName?.trim();
    if (!title) {
      return this.pauseReinterpret(
        clientName
          ? `Quiero crear el pendiente para «${clientName}», pero me falta el título. ¿Qué hay que hacer exactamente?`
          : 'Quiero crear ese pendiente, pero me falta saber qué hay que hacer y para qué cliente. ¿Me lo cuentas?',
      );
    }
    if (!clientName) {
      return {
        kind: 'pause',
        pause: {
          awaiting: { kind: 'name-fix', target: 'client', query: '' },
          question: `¿Para qué cliente creo «${title}»?`,
        },
      };
    }
    const clientRes = await this.resolveClientFor(state, clientName, {
      createIntent: intent,
      noneQuestion: `No encuentro un cliente llamado «${clientName}». ¿Para qué cliente es «${title}»?`,
    });
    if (clientRes.pause) return { kind: 'pause', pause: clientRes.pause };
    const client = clientRes.client as ClientResponseDto;

    const memberNames = (intent.memberNames ?? [])
      .map((n) => n.trim())
      .filter(Boolean);
    if (memberNames.length === 0) {
      const task = await this.tasksService.create({
        clientId: client.id,
        title,
        links: intent.links?.map((url) => ({ url })),
      });
      await replyHtml(
        ctx,
        `🆕 Listo, creé este pendiente para ${escapeHtml(client.name)}:\n${taskBlock(task)}`,
      );
      return { kind: 'done' };
    }

    const membersRes = await this.resolveMembersFor(state, memberNames);
    if (membersRes.pause) return { kind: 'pause', pause: membersRes.pause };
    const members = membersRes.members as TeamMemberResponseDto[];
    const namesText = humanList(members.map((m) => m.name));

    if (intent.dueDate) {
      const task = await this.tasksService.create({
        clientId: client.id,
        title,
        links: intent.links?.map((url) => ({ url })),
      });
      try {
        const assigned = await this.tasksService.assign(task.id, {
          memberIds: members.map((m) => m.id),
          dueDate: parseDateToIso(intent.dueDate),
        });
        await replyHtml(
          ctx,
          `🆕 Creé el pendiente para ${escapeHtml(client.name)} y se lo asigné a ${escapeHtml(namesText)}:\n${taskBlock(assigned)}`,
        );
      } catch (err) {
        if (!(err instanceof UsageError) && !(err instanceof HttpException)) {
          throw err;
        }
        const msg =
          err instanceof UsageError ? err.message : httpMessage(err);
        await replyHtml(
          ctx,
          `🆕 Creé el pendiente para ${escapeHtml(client.name)}, pero no pude asignarlo: ${escapeHtml(msg)}\n${taskBlock(task)}`,
        );
      }
      return { kind: 'done' };
    }

    // Sin fecha: crear ahora (agrupando los crear_pendiente equivalentes que
    // vienen detrás) y preguntar UNA sola vez la fecha de asignación.
    const groupIndexes = [0];
    for (let i = 1; i < state.intents.length; i++) {
      const other = state.intents[i];
      if (
        other.operation === 'crear_pendiente' &&
        other.title?.trim() &&
        !other.dueDate &&
        this.sameTarget(intent, other)
      ) {
        groupIndexes.push(i);
      }
    }
    const created: TaskResponseDto[] = [];
    for (const i of groupIndexes) {
      const item = state.intents[i] as CrearPendienteIntent;
      try {
        created.push(
          await this.tasksService.create({
            clientId: client.id,
            title: (item.title as string).trim(),
            links: item.links?.map((url) => ({ url })),
          }),
        );
      } catch (err) {
        if (!(err instanceof UsageError) && !(err instanceof HttpException)) {
          throw err;
        }
        const msg =
          err instanceof UsageError ? err.message : httpMessage(err);
        await ctx.reply(`⚠️ No pude crear «${item.title}»: ${msg}`);
      }
    }
    for (const i of [...groupIndexes].reverse()) state.intents.splice(i, 1);
    if (created.length === 0) return { kind: 'done' };

    const awaiting: DraftAwaiting = {
      kind: 'due-date',
      taskIds: created.map((t) => t.id),
      memberIds: members.map((m) => m.id),
      memberNames: members.map((m) => m.name),
    };
    const question =
      created.length === 1
        ? `Creé el pendiente «${created[0].title}» para ${client.name}. ¿Para qué fecha se lo asigno a ${namesText}?`
        : `Detecté ${created.length} pendientes para ${client.name} asignados a ${namesText}:\n${created
            .map((t, idx) => `${idx + 1}) ${t.title}`)
            .join('\n')}\nLos creé. ¿Para qué fecha se los asigno?`;
    return { kind: 'pause', pause: { awaiting, question } };
  }

  /** Dos crear_pendiente comparten cliente y asignados (normalizados). */
  private sameTarget(
    a: CrearPendienteIntent,
    b: CrearPendienteIntent,
  ): boolean {
    if (normalizeName(a.clientName ?? '') !== normalizeName(b.clientName ?? '')) {
      return false;
    }
    const an = (a.memberNames ?? []).map(normalizeName).sort();
    const bn = (b.memberNames ?? []).map(normalizeName).sort();
    return an.length === bn.length && an.every((v, i) => v === bn[i]);
  }

  private async asignar(
    ctx: Context,
    state: QueueState,
    intent: Extract<AiIntent, { operation: 'asignar' }>,
  ): Promise<StepResult> {
    const memberNames = (intent.memberNames ?? [])
      .map((n) => n.trim())
      .filter(Boolean);
    const taskRes = await this.resolveTask(
      intent,
      memberNames.length > 0
        ? `asignarle a ${humanList(memberNames)}`
        : 'asignar',
    );
    if (taskRes.pause) return { kind: 'pause', pause: taskRes.pause };
    const task = taskRes.task as TaskResponseDto;
    this.applyTaskToIntent(intent, task.id);

    if (memberNames.length === 0) {
      return this.pauseReinterpret(
        `¿A quién del equipo le asigno «${task.title}» (#${task.id})?`,
      );
    }
    const membersRes = await this.resolveMembersFor(state, memberNames);
    if (membersRes.pause) return { kind: 'pause', pause: membersRes.pause };
    const members = membersRes.members as TeamMemberResponseDto[];
    const namesText = humanList(members.map((m) => m.name));

    if (!intent.dueDate) {
      state.intents.shift(); // la asignación se completa al llegar la fecha
      return {
        kind: 'pause',
        pause: {
          awaiting: {
            kind: 'due-date',
            taskIds: [task.id],
            memberIds: members.map((m) => m.id),
            memberNames: members.map((m) => m.name),
          },
          question: `¿Para qué fecha le asigno «${task.title}» (#${task.id}) a ${namesText}?`,
        },
      };
    }
    const assigned = await this.tasksService.assign(task.id, {
      memberIds: members.map((m) => m.id),
      dueDate: parseDateToIso(intent.dueDate),
    });
    await replyHtml(
      ctx,
      `📌 Listo: asignado a ${escapeHtml(namesText)}:\n${taskBlock(assigned)}`,
    );
    return { kind: 'done' };
  }

  private async reasignar(
    ctx: Context,
    state: QueueState,
    intent: Extract<AiIntent, { operation: 'reasignar' }>,
  ): Promise<StepResult> {
    const memberNames = (intent.memberNames ?? [])
      .map((n) => n.trim())
      .filter(Boolean);
    const taskRes = await this.resolveTask(
      intent,
      memberNames.length > 0
        ? `pasarle a ${humanList(memberNames)}`
        : 'reasignar',
    );
    if (taskRes.pause) return { kind: 'pause', pause: taskRes.pause };
    const task = taskRes.task as TaskResponseDto;
    this.applyTaskToIntent(intent, task.id);

    if (memberNames.length === 0) {
      return this.pauseReinterpret(
        `¿A quién le paso «${task.title}» (#${task.id})?`,
      );
    }
    if (!intent.reason?.trim()) {
      return this.pauseReinterpret(
        `¿Cuál es la razón para reasignar «${task.title}» (#${task.id}) a ${humanList(memberNames)}? La necesito para el historial.`,
      );
    }
    const membersRes = await this.resolveMembersFor(state, memberNames);
    if (membersRes.pause) return { kind: 'pause', pause: membersRes.pause };
    const members = membersRes.members as TeamMemberResponseDto[];
    const updated = await this.tasksService.reassign(task.id, {
      memberIds: members.map((m) => m.id),
      reason: intent.reason,
    });
    await replyHtml(
      ctx,
      `🔄 Hecho: reasignado a ${escapeHtml(humanList(members.map((m) => m.name)))}:\n${taskBlock(updated)}`,
    );
    return { kind: 'done' };
  }

  private async extender(
    ctx: Context,
    state: QueueState,
    intent: Extract<AiIntent, { operation: 'extender' }>,
  ): Promise<StepResult> {
    const taskRes = await this.resolveTask(intent, 'extender');
    if (taskRes.pause) return { kind: 'pause', pause: taskRes.pause };
    const task = taskRes.task as TaskResponseDto;
    this.applyTaskToIntent(intent, task.id);

    const hasDate = Boolean(intent.newDueDate);
    const hasReason = Boolean(intent.reason?.trim());
    if (!hasDate && !hasReason) {
      return this.pauseReinterpret(
        `Para extender «${task.title}» (#${task.id}) me faltan la nueva fecha y la razón. ¿Me las dices? (ej: "al 2026-06-25 porque el cliente pidió cambios")`,
      );
    }
    if (!hasDate) {
      return this.pauseReinterpret(
        `¿Hasta qué fecha extiendo «${task.title}» (#${task.id})?`,
      );
    }
    if (!hasReason) {
      return this.pauseReinterpret(
        `¿Y cuál es la razón para extender «${task.title}» (#${task.id})? Queda en el historial.`,
      );
    }
    const updated = await this.tasksService.extend(task.id, {
      newDueDate: parseDateToIso(intent.newDueDate as string),
      reason: intent.reason as string,
    });
    await replyHtml(
      ctx,
      `⏳ Hecho: extendí la entrega al ${intent.newDueDate}:\n${taskBlock(updated)}`,
    );
    return { kind: 'done' };
  }

  private async terminar(
    ctx: Context,
    _state: QueueState,
    intent: Extract<AiIntent, { operation: 'terminar' }>,
  ): Promise<StepResult> {
    const taskRes = await this.resolveTask(intent, 'dar por terminado');
    if (taskRes.pause) return { kind: 'pause', pause: taskRes.pause };
    const task = taskRes.task as TaskResponseDto;
    this.applyTaskToIntent(intent, task.id);
    const updated = await this.tasksService.complete(task.id);
    await replyHtml(
      ctx,
      `✅ Listo, marcado como terminado:\n${taskBlock(updated)}`,
    );
    return { kind: 'done' };
  }

  private async cambiarEstado(
    ctx: Context,
    _state: QueueState,
    intent: Extract<AiIntent, { operation: 'cambiar_estado' }>,
  ): Promise<StepResult> {
    const validStatus =
      intent.status && TASK_STATUSES.includes(intent.status)
        ? intent.status
        : undefined;
    const taskRes = await this.resolveTask(
      intent,
      validStatus ? `pasar a ${validStatus}` : 'cambiar de estado',
    );
    if (taskRes.pause) return { kind: 'pause', pause: taskRes.pause };
    const task = taskRes.task as TaskResponseDto;
    this.applyTaskToIntent(intent, task.id);

    if (!validStatus) {
      return this.pauseReinterpret(
        `¿A qué estado paso «${task.title}» (#${task.id})? Puede ser ${TASK_STATUSES.join(', ')}.`,
      );
    }
    const reason = intent.reason;
    if (validStatus === 'EXTENDIDO' && !reason?.trim()) {
      return this.pauseReinterpret(
        `Para pasar «${task.title}» (#${task.id}) a EXTENDIDO necesito la razón (queda en el historial). ¿Cuál es?`,
      );
    }
    const updated = await this.tasksService.changeStatus(task.id, {
      status: validStatus,
      reason: reason || undefined,
    });
    await replyHtml(
      ctx,
      `${STATUS_EMOJI[updated.status] ?? ''} Estado actualizado:\n${taskBlock(updated)}`,
    );
    return { kind: 'done' };
  }

  /**
   * Comentario del dueño sobre un pendiente. La tarea se resuelve por taskId
   * directo o por título (fuzzy con confirmación, igual que el modo de
   * equipo); si falta el mensaje se pregunta y se toma LITERAL (sin volver al
   * LLM). La notificación a los asignados la envía TaskCommentsService.
   */
  private async comentar(
    ctx: Context,
    intent: Extract<AiIntent, { operation: 'comentar' }>,
  ): Promise<StepResult> {
    const taskRes = await this.resolveTask(intent, 'comentar');
    if (taskRes.pause) return { kind: 'pause', pause: taskRes.pause };
    const task = taskRes.task as TaskResponseDto;
    this.applyTaskToIntent(intent, task.id);

    const message = intent.message?.trim();
    if (!message) {
      return {
        kind: 'pause',
        pause: {
          awaiting: { kind: 'comment-text' },
          question: `¿Qué les digo sobre «${task.title}»? Escríbeme el comentario tal cual.`,
        },
      };
    }

    // La notificación (asignados con chat vinculado, excepto el autor) vive
    // dentro del service: aquí solo se confirma al dueño.
    await this.taskCommentsService.add(task.id, { type: 'DUENO' }, message);

    const assigneeNames = task.assignees.map((a) => a.name);
    if (assigneeNames.length === 0) {
      await ctx.reply(
        `💬 Listo, guardé tu comentario en «${task.title}» (${task.client.name}). Aún no hay nadie asignado, así que de momento queda solo en el hilo.`,
      );
      return { kind: 'done' };
    }
    const internal = await this.teamMembersService.findAllInternal();
    const linkedIds = new Set(
      internal.filter((m) => m.telegramChatId).map((m) => m.id),
    );
    const notified = task.assignees
      .filter((a) => linkedIds.has(a.memberId))
      .map((a) => a.name);
    if (notified.length > 0) {
      await ctx.reply(
        `💬 Listo, dejé tu comentario en «${task.title}» (${task.client.name}) y le avisé a ${humanList(notified)}.`,
      );
    } else {
      await ctx.reply(
        `💬 Listo, dejé tu comentario en «${task.title}» (${task.client.name}). Eso sí: ${humanList(assigneeNames)} no ${assigneeNames.length > 1 ? 'tienen' : 'tiene'} Telegram vinculado, así que no ${assigneeNames.length > 1 ? 'recibieron' : 'recibió'} el aviso.`,
      );
    }
    return { kind: 'done' };
  }

  // ---------- intenciones de consulta ----------

  private async listarPendientes(
    ctx: Context,
    state: QueueState,
    intent: Extract<AiIntent, { operation: 'listar_pendientes' }>,
  ): Promise<StepResult> {
    let clientId: number | undefined;
    let clientLabel: string | undefined;
    if (intent.clientName?.trim()) {
      const name = intent.clientName.trim();
      const res = await this.resolveClientFor(state, name, {
        noneQuestion: `No encuentro un cliente llamado «${name}». ¿De qué cliente quieres ver los pendientes?`,
      });
      if (res.pause) return { kind: 'pause', pause: res.pause };
      const client = res.client as ClientResponseDto;
      clientId = client.id;
      clientLabel = client.name;
    }
    let memberId: number | undefined;
    let memberLabel: string | undefined;
    if (intent.memberName?.trim()) {
      const res = await this.resolveMembersFor(state, [
        intent.memberName.trim(),
      ]);
      if (res.pause) return { kind: 'pause', pause: res.pause };
      const member = (res.members as TeamMemberResponseDto[])[0];
      memberId = member.id;
      memberLabel = member.name;
    }
    let title = 'Pendientes abiertos';
    if (memberLabel && clientLabel) {
      title = `Pendientes abiertos de ${escapeHtml(memberLabel)} en ${escapeHtml(clientLabel)}`;
    } else if (memberLabel) {
      title = `Pendientes abiertos de ${escapeHtml(memberLabel)}`;
    } else if (clientLabel) {
      title = `Pendientes abiertos de ${escapeHtml(clientLabel)}`;
    }
    const tasks = (
      await this.tasksService.findAll({ clientId, memberId })
    ).filter((t) => t.status !== 'TERMINADO');
    await replyHtml(ctx, formatOpenTasks(title, tasks));
    return { kind: 'done' };
  }

  // ---------- descripción de intenciones para reinterpretación ----------

  /**
   * Reconstruye en lenguaje natural una intención incompleta para fusionarla
   * con el siguiente mensaje SIN re-derivar (ni re-ejecutar) las intenciones
   * que ya se procesaron en este hilo.
   */
  private describeIntent(intent: AiIntent): string {
    switch (intent.operation) {
      case 'crear_pendiente': {
        const parts = ['crea un pendiente'];
        if (intent.clientName) parts.push(`para ${intent.clientName}`);
        if (intent.title) parts.push(`titulado "${intent.title}"`);
        if (intent.memberNames?.length) {
          parts.push(`asignado a ${intent.memberNames.join(', ')}`);
        }
        if (intent.dueDate) parts.push(`para el ${intent.dueDate}`);
        if (intent.links?.length) {
          parts.push(`con links ${intent.links.join(' ')}`);
        }
        return parts.join(' ');
      }
      case 'asignar': {
        const parts = [
          `asigna el pendiente ${intent.taskId ?? intent.taskRef ?? ''}`.trim(),
        ];
        if (intent.memberNames?.length) {
          parts.push(`a ${intent.memberNames.join(', ')}`);
        }
        if (intent.dueDate) parts.push(`para el ${intent.dueDate}`);
        return parts.join(' ');
      }
      case 'reasignar': {
        const parts = [
          `reasigna el pendiente ${intent.taskId ?? intent.taskRef ?? ''}`.trim(),
        ];
        if (intent.memberNames?.length) {
          parts.push(`a ${intent.memberNames.join(', ')}`);
        }
        if (intent.reason) parts.push(`porque ${intent.reason}`);
        return parts.join(' ');
      }
      case 'extender': {
        const parts = [
          `extiende el pendiente ${intent.taskId ?? intent.taskRef ?? ''}`.trim(),
        ];
        if (intent.newDueDate) parts.push(`al ${intent.newDueDate}`);
        if (intent.reason) parts.push(`porque ${intent.reason}`);
        return parts.join(' ');
      }
      case 'terminar':
        return `termina el pendiente ${intent.taskId ?? intent.taskRef ?? ''}`.trim();
      case 'comentar': {
        const parts = [
          `comenta el pendiente ${intent.taskId ?? intent.taskRef ?? ''}`.trim(),
        ];
        if (intent.message) parts.push(`: ${intent.message}`);
        return parts.join('');
      }
      case 'cambiar_estado': {
        const parts = [
          `pasa el pendiente ${intent.taskId ?? intent.taskRef ?? ''}`.trim(),
          intent.status ? `a ${intent.status}` : '',
        ].filter(Boolean);
        if (intent.reason) parts.push(`porque ${intent.reason}`);
        return parts.join(' ');
      }
      case 'listar_pendientes': {
        const parts = ['lista los pendientes'];
        if (intent.memberName) parts.push(`de ${intent.memberName}`);
        if (intent.clientName) {
          parts.push(`${intent.memberName ? 'en' : 'de'} ${intent.clientName}`);
        }
        return parts.join(' ');
      }
      case 'listar_clientes':
        return 'lista los clientes';
      case 'listar_personas':
        return 'lista las personas del equipo';
      default:
        return '';
    }
  }
}
