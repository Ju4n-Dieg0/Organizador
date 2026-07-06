import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TASK_STATUSES } from '../tasks/dto/task-response.dto';
import {
  AI_OPERATIONS,
  AI_TEAM_OPERATIONS,
  AiContext,
  AiIntent,
  AiIntentResult,
  AiOperation,
  AiTeamContext,
  AiTeamIntent,
  AiTeamIntentResult,
  AiTeamOperation,
} from './ai-intent.types';
import {
  buildSystemPrompt,
  ChatMessage,
  FEW_SHOT_MESSAGES,
  INTENTS_JSON_SCHEMA,
} from './ai-prompt';
import {
  buildTeamSystemPrompt,
  TEAM_FEW_SHOT_MESSAGES,
  TEAM_INTENTS_JSON_SCHEMA,
} from './ai-team-prompt';

/**
 * Default generoso: en hardware modesto un modelo 8B puede tardar >30s en
 * procesar un prompt largo (listas de clientes/pendientes + few-shots).
 * Configurable con LMSTUDIO_TIMEOUT_MS.
 */
const DEFAULT_REQUEST_TIMEOUT_MS = 90_000;
/**
 * Techo de salida: una intención `crear_pendiente` con título largo ronda los
 * 50-70 tokens; un mensaje enumerado del dueño puede producir 6 intenciones
 * (~500 tokens) y con 600 se truncaba el JSON (verificado empíricamente
 * contra meta-llama-3.1-8b-instruct).
 */
const MAX_TOKENS = 1200;
/** Corta los divagues de modelos chicos: los shots son JSON de una línea. */
const STOP_SEQUENCES = ['\n\n'];
const MAX_INTENTS = 8;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Operaciones del dueño que refieren a un pendiente EXISTENTE. */
const TASK_SCOPED_OPERATIONS: ReadonlySet<AiOperation> = new Set<AiOperation>([
  'asignar',
  'reasignar',
  'extender',
  'terminar',
  'cambiar_estado',
  'comentar',
]);

/** Días de la semana (es, normalizados sin tildes) → índice Date.getDay(). */
const WEEKDAY_INDEX: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
};

/** Campos permitidos por operación; todo lo demás se descarta. */
const OPERATION_FIELDS: Record<AiOperation, string[]> = {
  crear_pendiente: ['clientName', 'title', 'links', 'memberNames', 'dueDate'],
  asignar: ['taskId', 'taskRef', 'memberNames', 'dueDate'],
  reasignar: ['taskId', 'taskRef', 'memberNames', 'reason'],
  extender: ['taskId', 'taskRef', 'newDueDate', 'reason'],
  terminar: ['taskId', 'taskRef'],
  cambiar_estado: ['taskId', 'taskRef', 'status', 'reason'],
  comentar: ['taskId', 'taskRef', 'message'],
  listar_pendientes: ['clientName', 'memberName'],
  listar_clientes: [],
  listar_personas: [],
  ayuda: [],
  charla: [],
  desconocida: [],
};

/** Campos permitidos por operación del modo de EQUIPO. */
const TEAM_OPERATION_FIELDS: Record<AiTeamOperation, string[]> = {
  mis_pendientes: [],
  pendientes_cliente: ['clientName'],
  terminar: ['taskId', 'taskRef'],
  comentar: ['taskId', 'taskRef', 'message'],
  solicitar_pendiente: ['clientName', 'title', 'memberNames', 'dueDate'],
  solicitar_extension: ['taskId', 'taskRef', 'newDueDate', 'reason'],
  solicitar_reasignacion: ['taskId', 'taskRef', 'memberNames', 'reason'],
  solicitar_cambio_estado: ['taskId', 'taskRef', 'status', 'reason'],
  ayuda: [],
  charla: [],
  desconocida: [],
};

/** Estados en inglés que phi-3 devuelve a veces → enum del dominio. */
const STATUS_SYNONYMS: Record<string, string> = {
  PENDING: 'PENDIENTE',
  ASSIGNED: 'ASIGNADO',
  DONE: 'TERMINADO',
  COMPLETED: 'TERMINADO',
  FINISHED: 'TERMINADO',
  TERMINATED: 'TERMINADO',
  EXTENDED: 'EXTENDIDO',
};

type CompletionResult =
  | { status: 'ok'; content: string }
  | { status: 'schema_rejected' }
  | { status: 'failed' };

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private readonly config: ConfigService) {}

  /** true solo si `LMSTUDIO_BASE_URL` está configurada. */
  isEnabled(): boolean {
    const baseUrl = this.config.get<string>('LMSTUDIO_BASE_URL');
    return typeof baseUrl === 'string' && baseUrl.trim().length > 0;
  }

  /** Timeout por petición a LM Studio (LMSTUDIO_TIMEOUT_MS o default). */
  private requestTimeoutMs(): number {
    const raw = Number(this.config.get<string>('LMSTUDIO_TIMEOUT_MS'));
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_REQUEST_TIMEOUT_MS;
  }

  /**
   * Interpreta texto libre del dueño como una LISTA de intenciones.
   *
   * Estrategia calibrada contra phi-3-mini:
   * 1. Intento SIN `response_format` (few-shot + stop + temperature 0): es el
   *    que produce mejor calidad, pero a veces responde prosa sin JSON.
   * 2. Reintento CON `response_format.json_schema` (strict): degrada la
   *    calidad pero garantiza JSON parseable; si el servidor rechaza el
   *    schema (4xx) se reintenta sin él.
   *
   * Nunca lanza: errores de red, timeout o JSON inservible tras ambos
   * intentos se loguean y devuelven `{ kind: 'error' }`.
   */
  async interpret(text: string, context: AiContext): Promise<AiIntentResult> {
    if (!this.isEnabled()) {
      this.logger.warn(
        'LMSTUDIO_BASE_URL no configurada: el modo conversacional está desactivado',
      );
      return { kind: 'error' };
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: buildSystemPrompt(context) },
      ...FEW_SHOT_MESSAGES,
      { role: 'user', content: text },
    ];
    return this.runInterpretation(messages, INTENTS_JSON_SCHEMA, (content) =>
      this.toResult(content, context, text),
    );
  }

  /**
   * Interpreta texto libre de un MIEMBRO del equipo (capacidades
   * restringidas: consultas propias/por cliente, terminar y solicitudes).
   * Misma estrategia de dos intentos que `interpret`, con prompt, schema,
   * whitelist de campos y sinónimos de operación propios del modo de equipo.
   */
  async interpretTeam(
    text: string,
    context: AiTeamContext,
  ): Promise<AiTeamIntentResult> {
    if (!this.isEnabled()) {
      this.logger.warn(
        'LMSTUDIO_BASE_URL no configurada: el modo conversacional está desactivado',
      );
      return { kind: 'error' };
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: buildTeamSystemPrompt(context) },
      ...TEAM_FEW_SHOT_MESSAGES,
      { role: 'user', content: text },
    ];
    return this.runInterpretation(
      messages,
      TEAM_INTENTS_JSON_SCHEMA,
      (content) => this.toTeamResult(content, context),
    );
  }

  /**
   * Núcleo compartido de los dos modos: intento sin `response_format`
   * (mejor calidad), reintento con `json_schema` strict (garantiza JSON
   * parseable) y degradación a sin-schema si el servidor lo rechaza.
   * `toResult` devuelve null cuando el contenido no tiene intenciones
   * utilizables (dispara el reintento).
   */
  private async runInterpretation<
    T extends { kind: string },
  >(
    messages: ChatMessage[],
    jsonSchema: unknown,
    toResult: (content: string) => T | null,
  ): Promise<T | { kind: 'error' }> {
    // Intento 1: sin salida estructurada (mejor calidad).
    const first = await this.requestCompletion(messages, null);
    if (first.status !== 'ok') {
      return { kind: 'error' };
    }
    const firstResult = toResult(first.content);
    if (firstResult !== null) {
      return firstResult;
    }
    this.logger.warn(
      'Respuesta de LM Studio sin intenciones utilizables: se reintenta con json_schema',
    );

    // Intento 2: con json_schema estricto (garantiza JSON parseable).
    let second = await this.requestCompletion(messages, jsonSchema);
    if (second.status === 'schema_rejected') {
      this.logger.warn(
        'LM Studio rechazó response_format.json_schema: se reintenta sin salida estructurada',
      );
      second = await this.requestCompletion(messages, null);
    }
    if (second.status !== 'ok') {
      return { kind: 'error' };
    }
    return toResult(second.content) ?? { kind: 'error' };
  }

  private async requestCompletion(
    messages: ChatMessage[],
    jsonSchema: unknown,
  ): Promise<CompletionResult> {
    const baseUrl = (this.config.get<string>('LMSTUDIO_BASE_URL') ?? '')
      .trim()
      .replace(/\/+$/, '');
    const model = this.config.get<string>('LMSTUDIO_MODEL') ?? '';

    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: 0,
      max_tokens: MAX_TOKENS,
    };
    if (jsonSchema !== null) {
      body.response_format = {
        type: 'json_schema',
        json_schema: jsonSchema,
      };
    } else {
      body.stop = STOP_SEQUENCES;
    }

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.requestTimeoutMs()),
      });

      if (!response.ok) {
        if (
          jsonSchema !== null &&
          response.status >= 400 &&
          response.status < 500
        ) {
          return { status: 'schema_rejected' };
        }
        this.logger.error(
          `LM Studio respondió HTTP ${response.status} en /chat/completions`,
        );
        return { status: 'failed' };
      }

      const payload: unknown = await response.json();
      const content = this.extractContent(payload);
      if (content === null) {
        this.logger.error(
          'Respuesta de LM Studio sin contenido en choices[0].message.content',
        );
        return { status: 'failed' };
      }
      return { status: 'ok', content };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Error de red o timeout al llamar a LM Studio: ${message}`,
      );
      return { status: 'failed' };
    }
  }

  private extractContent(payload: unknown): string | null {
    if (typeof payload !== 'object' || payload === null) return null;
    const choices = (payload as { choices?: unknown }).choices;
    if (!Array.isArray(choices) || choices.length === 0) return null;
    const first: unknown = choices[0];
    if (typeof first !== 'object' || first === null) return null;
    const message = (first as { message?: unknown }).message;
    if (typeof message !== 'object' || message === null) return null;
    const content = (message as { content?: unknown }).content;
    return typeof content === 'string' ? content : null;
  }

  /**
   * Convierte la respuesta cruda del modelo en un `AiIntentResult`.
   * Devuelve null si no se extrajo NINGUNA intención (dispara el reintento).
   * Con ≥1 intención: filtra charla/desconocida si hay otras ejecutables;
   * todas charla → smalltalk; todas desconocida → unknown.
   */
  private toResult(
    content: string,
    context: AiContext,
    userText: string,
  ): AiIntentResult | null {
    const intents = this.collectIntents(content, context, userText);
    if (intents === null || intents.length === 0) {
      return null;
    }

    const executable = intents.filter(
      (i) => i.operation !== 'charla' && i.operation !== 'desconocida',
    );
    if (executable.length > 0) {
      return { kind: 'intents', intents: executable };
    }
    if (intents.some((i) => i.operation === 'charla')) {
      return { kind: 'smalltalk' };
    }
    return { kind: 'unknown' };
  }

  /** Equivalente de `toResult` para el modo de equipo. */
  private toTeamResult(
    content: string,
    context: AiTeamContext,
  ): AiTeamIntentResult | null {
    const intents = this.collectTeamIntents(content, context);
    if (intents === null || intents.length === 0) {
      return null;
    }
    const executable = intents.filter(
      (i) => i.operation !== 'charla' && i.operation !== 'desconocida',
    );
    if (executable.length > 0) {
      return { kind: 'intents', intents: executable };
    }
    if (intents.some((i) => i.operation === 'charla')) {
      return { kind: 'smalltalk' };
    }
    return { kind: 'unknown' };
  }

  /** Extrae y normaliza intenciones de equipo del contenido del modelo. */
  private collectTeamIntents(
    content: string,
    context: AiTeamContext,
  ): AiTeamIntent[] | null {
    const items = this.extractIntentItems(content);
    if (items === null) {
      return null;
    }
    const intents: AiTeamIntent[] = [];
    for (const item of items.slice(0, MAX_INTENTS)) {
      const intent = this.normalizeTeamIntent(item, context.today);
      if (intent !== null) {
        intents.push(intent);
      }
    }
    return intents;
  }

  /** Normaliza un elemento crudo a AiTeamIntent; null si no tiene operación. */
  private normalizeTeamIntent(
    item: unknown,
    today: string,
  ): AiTeamIntent | null {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return null;
    }
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.operation !== 'string') {
      return null;
    }

    const operation = this.normalizeTeamOperation(candidate.operation, candidate);
    const intent: Record<string, unknown> = { operation };
    for (const field of TEAM_OPERATION_FIELDS[operation]) {
      const value = this.sanitizeField(field, candidate[field], today);
      if (value !== undefined) {
        intent[field] = value;
      }
    }
    return intent as AiTeamIntent;
  }

  /**
   * Normaliza el nombre de operación del modo de equipo. Los modelos
   * inventan variantes del modo dueño (`extender`, `reasignar`,
   * `crear_pendiente`, `pedir_extension`, `listar_pendientes`...): aquí se
   * mapean a las operaciones restringidas del equipo. `listar_pendientes`
   * sin cliente → `mis_pendientes`; con cliente → `pendientes_cliente`.
   * El orden importa: las reglas más específicas van primero.
   */
  private normalizeTeamOperation(
    raw: string,
    candidate: Record<string, unknown>,
  ): AiTeamOperation {
    const op = raw.trim().toLowerCase();
    const hasClientName =
      typeof candidate.clientName === 'string' &&
      candidate.clientName.trim().length > 0;
    if ((AI_TEAM_OPERATIONS as readonly string[]).includes(op)) {
      if (op === 'pendientes_cliente' && !hasClientName) {
        return 'mis_pendientes';
      }
      return op as AiTeamOperation;
    }

    const has = (...needles: string[]) => needles.some((n) => op.includes(n));
    if (has('coment', 'mensaje', 'avis', 'decir', 'dile', 'nota')) {
      return 'comentar';
    }
    if (has('reasign')) return 'solicitar_reasignacion';
    if (
      has(
        'exten',
        'prorrog',
        'mas_tiempo',
        'cambiar_fecha',
        'actualizar_fecha',
        'nueva_fecha',
        'mover_fecha',
      )
    ) {
      return 'solicitar_extension';
    }
    if (has('termin', 'finaliz', 'complet', 'entreg')) return 'terminar';
    if (has('crear', 'nuevo', 'nueva', 'proponer', 'agregar', 'anadir', 'añadir')) {
      return 'solicitar_pendiente';
    }
    if (has('estado', 'marcar')) return 'solicitar_cambio_estado';
    if (has('asign', 'pasar', 'transferir', 'delegar')) {
      return 'solicitar_reasignacion';
    }
    if (has('mis_', 'mios', 'propios')) return 'mis_pendientes';
    if (has('listar', 'pendiente', 'tarea', 'consulta', 'ver')) {
      return hasClientName ? 'pendientes_cliente' : 'mis_pendientes';
    }
    if (has('cliente')) return 'pendientes_cliente';
    if (has('ayuda', 'help')) return 'ayuda';
    if (has('charla', 'gracias', 'salud', 'hola', 'small')) return 'charla';
    return 'desconocida';
  }

  /**
   * Extrae y normaliza la lista de intenciones del contenido del modelo.
   * Acepta `{"intents":[...]}`, un objeto suelto con `operation` (se envuelve
   * como lista de 1) o un array de objetos. Máximo MAX_INTENTS intenciones.
   * Devuelve null si no hay JSON con esa forma.
   */
  private collectIntents(
    content: string,
    context: AiContext,
    userText: string,
  ): AiIntent[] | null {
    const items = this.extractIntentItems(content);
    if (items === null) {
      return null;
    }

    const intents: AiIntent[] = [];
    for (const item of items.slice(0, MAX_INTENTS)) {
      const intent = this.normalizeIntent(item, context.today);
      if (intent !== null) {
        if (intent.operation === 'crear_pendiente') {
          this.resolveClientFromTitle(intent, context);
        }
        this.verifyTaskId(intent, context, userText);
        intents.push(intent);
      }
    }
    if (intents.length === 1) {
      this.fixWeekdayDate(intents[0], context.today, userText);
    }
    return intents;
  }

  /**
   * Red de seguridad determinista del taskId del dueño: el modelo solo puede
   * afirmarlo si el número aparece en el mensaje (explícito, p. ej. "el 12")
   * o si es un id real de la lista de pendientes ABIERTOS del contexto (el
   * modelo lo resolvió de esa lista, igual que el modo de equipo con
   * `myTasks`). Cualquier otro id se descarta: queda el taskRef o el bot
   * pregunta, pero nunca se actúa sobre un pendiente inventado.
   */
  private verifyTaskId(
    intent: AiIntent,
    context: AiContext,
    userText: string,
  ): void {
    if (!TASK_SCOPED_OPERATIONS.has(intent.operation)) return;
    const scoped = intent as { taskId?: number };
    const id = scoped.taskId;
    if (id === undefined) return;
    if (context.openTasks.some((t) => t.id === id)) return;
    if (new RegExp(`(^|\\D)${id}(\\D|$)`).test(userText)) return;
    scoped.taskId = undefined;
  }

  /**
   * Corrección determinista de fechas relativas por día de semana: los
   * modelos chicos fallan la aritmética de calendario («al lunes» → un
   * domingo). Solo actúa cuando hay UNA intención, el mensaje menciona
   * EXACTAMENTE un día de la semana y no trae fecha explícita YYYY-MM-DD:
   * entonces la fecha de la intención se fija a la próxima ocurrencia de ese
   * día (siempre a futuro, mismas semánticas que el parser local del bot).
   */
  private fixWeekdayDate(
    intent: AiIntent,
    today: string,
    userText: string,
  ): void {
    const usesDueDate =
      intent.operation === 'crear_pendiente' || intent.operation === 'asignar';
    const usesNewDueDate = intent.operation === 'extender';
    if (!usesDueDate && !usesNewDueDate) return;
    if (/\d{4}-\d{2}-\d{2}/.test(userText)) return;

    const norm = this.normalizeText(userText);
    const mentioned = Object.keys(WEEKDAY_INDEX).filter((w) =>
      new RegExp(`\\b${w}\\b`).test(norm),
    );
    if (mentioned.length !== 1) return;
    const target = WEEKDAY_INDEX[mentioned[0]];

    const base = new Date(`${today}T00:00:00`);
    if (Number.isNaN(base.getTime())) return;
    const scoped = intent as { dueDate?: string; newDueDate?: string };
    const current = usesDueDate ? scoped.dueDate : scoped.newDueDate;
    if (current !== undefined) {
      const currentDay = new Date(`${current}T00:00:00`).getDay();
      if (currentDay === target) return; // el modelo acertó: no tocar
    }
    const diff = (target - base.getDay() + 7) % 7 || 7; // siempre a futuro
    base.setDate(base.getDate() + diff);
    const fixed = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`;
    if (usesDueDate) scoped.dueDate = fixed;
    else scoped.newDueDate = fixed;
  }

  /**
   * Extrae la lista cruda de intenciones del contenido del modelo (compartido
   * por ambos modos). Acepta `{"intents":[...]}`, un objeto suelto con
   * `operation` (se envuelve como lista de 1) o un array de objetos.
   * Devuelve null si no hay JSON con esa forma.
   */
  private extractIntentItems(content: string): unknown[] | null {
    const raw = this.parseJson(content);
    if (Array.isArray(raw)) {
      return raw;
    }
    if (typeof raw === 'object' && raw !== null) {
      const candidate = raw as Record<string, unknown>;
      if (Array.isArray(candidate.intents)) {
        return candidate.intents;
      }
      if ('operation' in candidate) {
        return [candidate];
      }
    }
    return null;
  }

  /**
   * Post-procesado determinista de `crear_pendiente`: phi-3 a veces deja el
   * cliente DENTRO del título ("...para el cliente ToGrow") sin `clientName`.
   *
   * - Sin `clientName`: si EXACTAMENTE un cliente activo del contexto aparece
   *   como substring del título (comparación NFD sin diacríticos, lowercase),
   *   se asigna su nombre real y se limpia el sufijo que lo menciona.
   * - Con `clientName`: solo se limpia el sufijo si el título termina
   *   mencionando ese mismo cliente.
   * - Si ningún cliente del contexto aparece, la intención queda intacta
   *   (el bot preguntará el cliente). Si al limpiar el título quedara vacío,
   *   se conserva el título original.
   */
  private resolveClientFromTitle(
    intent: AiIntent & { operation: 'crear_pendiente' },
    context: AiContext,
  ): void {
    if (typeof intent.title !== 'string' || intent.title.length === 0) {
      return;
    }

    let clientName = intent.clientName;
    if (clientName === undefined) {
      const normalizedTitle = this.normalizeText(intent.title);
      const matches = context.clients.filter((c) =>
        normalizedTitle.includes(this.normalizeText(c.name)),
      );
      if (matches.length !== 1) {
        return;
      }
      clientName = matches[0].name;
      intent.clientName = clientName;
    }

    const cleaned = this.stripClientSuffix(intent.title, clientName);
    if (cleaned.length > 0) {
      intent.title = cleaned;
    }
  }

  /**
   * Elimina del final del título la mención al cliente con patrones tipo
   * "para/de/del [el cliente] <nombre>". Trabaja sobre el título normalizado
   * (NFD sin diacríticos, lowercase) y recorta el original por índice: la
   * normalización por carácter preserva longitudes en texto español, y si
   * no las preservara se devuelve el título intacto (nunca se corrompe).
   */
  private stripClientSuffix(title: string, clientName: string): string {
    const normalizedTitle = this.normalizeText(title);
    if (normalizedTitle.length !== title.length) {
      return title;
    }
    const escapedClient = this.escapeRegExp(this.normalizeText(clientName));
    const suffixPattern = new RegExp(
      `\\s*(?:para|de|del)\\s+(?:el\\s+cliente\\s+)?${escapedClient}\\s*$`,
      'i',
    );
    const match = suffixPattern.exec(normalizedTitle);
    if (match === null) {
      return title;
    }
    return title.slice(0, match.index).trim();
  }

  /** Normalización para comparar nombres: NFD sin diacríticos + lowercase. */
  private normalizeText(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  /** Escapa caracteres especiales de regex en un literal. */
  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** Normaliza un elemento crudo a AiIntent; null si no tiene operación. */
  private normalizeIntent(item: unknown, today: string): AiIntent | null {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return null;
    }
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.operation !== 'string') {
      return null;
    }

    const operation = this.normalizeOperation(candidate.operation);
    const intent: Record<string, unknown> = { operation };
    for (const field of OPERATION_FIELDS[operation]) {
      const value = this.sanitizeField(field, candidate[field], today);
      if (value !== undefined) {
        intent[field] = value;
      }
    }
    return intent as AiIntent;
  }

  /**
   * Normaliza el nombre de operación: phi-3 inventa variantes
   * (`gracias`, `terminar_pendiente`, `marcar_como`, `obtener_clientes`,
   * `actualizar_fecha`, `consulta_pendiente`, `fin_periodo`...).
   * El orden importa: las reglas más específicas van primero.
   */
  private normalizeOperation(raw: string): AiOperation {
    const op = raw.trim().toLowerCase();
    if ((AI_OPERATIONS as readonly string[]).includes(op)) {
      return op as AiOperation;
    }

    const has = (...needles: string[]) => needles.some((n) => op.includes(n));
    if (has('coment', 'mensaje', 'avis', 'decir', 'dile', 'nota')) {
      return 'comentar';
    }
    if (has('reasign')) return 'reasignar';
    if (has('crear', 'nuevo') && op.includes('pendiente')) {
      return 'crear_pendiente';
    }
    if (has('asign')) return 'asignar';
    if (has('extend', 'prorrog', 'actualizar_fecha', 'cambiar_fecha')) {
      return 'extender';
    }
    if (has('termin', 'finaliz', 'complet', 'fin_')) return 'terminar';
    if (has('estado', 'marcar')) return 'cambiar_estado';
    if (has('consulta', 'pendiente')) return 'listar_pendientes';
    if (has('cliente')) return 'listar_clientes';
    if (has('persona', 'equipo', 'miembro')) return 'listar_personas';
    if (has('ayuda', 'help')) return 'ayuda';
    if (has('charla', 'gracias', 'salud', 'hola', 'small')) return 'charla';
    return 'desconocida';
  }

  /**
   * Valida y coerciona el tipo de un campo; undefined si es inválido o falta.
   * Tolerancias: taskId acepta string numérica; status acepta lowercase y
   * variantes en inglés; memberNames/links aceptan una string suelta.
   * Fechas anteriores a hoy se descartan: el fallback con json_schema a veces
   * inventa fechas pasadas (mejor que el bot pregunte a ejecutar un invento).
   */
  private sanitizeField(field: string, value: unknown, today: string): unknown {
    if (value === undefined || value === null) return undefined;
    switch (field) {
      case 'taskId': {
        if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
          return value;
        }
        if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
          const parsed = Number.parseInt(value.trim(), 10);
          return parsed > 0 ? parsed : undefined;
        }
        return undefined;
      }
      case 'dueDate':
      case 'newDueDate': {
        if (typeof value !== 'string') return undefined;
        const date = value.trim();
        if (!DATE_REGEX.test(date)) return undefined;
        // YYYY-MM-DD compara bien lexicográficamente.
        if (DATE_REGEX.test(today) && date < today) return undefined;
        return date;
      }
      case 'memberNames':
      case 'links': {
        const list =
          typeof value === 'string' ? [value] : Array.isArray(value) ? value : null;
        if (list === null) return undefined;
        const cleaned = list.filter(
          (v): v is string => typeof v === 'string' && v.trim().length > 0,
        );
        return cleaned.length > 0 ? cleaned : undefined;
      }
      case 'status': {
        if (typeof value !== 'string') return undefined;
        const upper = value.trim().toUpperCase();
        if ((TASK_STATUSES as readonly string[]).includes(upper)) return upper;
        return STATUS_SYNONYMS[upper];
      }
      case 'clientName':
      case 'memberName':
      case 'title':
      case 'taskRef':
      case 'reason':
      case 'message':
        return typeof value === 'string' && value.trim().length > 0
          ? value.trim()
          : undefined;
      default:
        return undefined;
    }
  }

  /**
   * Parsea JSON tolerando fences ```json ... ``` y texto alrededor
   * (primer bloque {...} o [...] balanceado).
   */
  private parseJson(content: string): unknown {
    let text = content.trim();
    const fenceMatch = /```(?:json)?\s*([\s\S]*?)\s*```/.exec(text);
    if (fenceMatch) {
      text = fenceMatch[1].trim();
    }
    try {
      return JSON.parse(text);
    } catch {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start === -1 || end <= start) return null;
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
  }
}
