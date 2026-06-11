import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TASK_STATUSES } from '../tasks/dto/task-response.dto';
import {
  AI_OPERATIONS,
  AiContext,
  AiIntent,
  AiIntentResult,
  AiOperation,
} from './ai-intent.types';

const REQUEST_TIMEOUT_MS = 30_000;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Campos permitidos por operación; todo lo demás se descarta. */
const OPERATION_FIELDS: Record<AiOperation, string[]> = {
  crear_pendiente: ['clientName', 'title', 'links'],
  asignar: ['taskId', 'memberNames', 'dueDate'],
  reasignar: ['taskId', 'memberNames', 'reason'],
  extender: ['taskId', 'newDueDate', 'reason'],
  terminar: ['taskId'],
  cambiar_estado: ['taskId', 'status', 'reason'],
  listar_pendientes: ['clientName'],
  listar_clientes: [],
  listar_personas: [],
  ayuda: [],
  desconocida: [],
};

/** JSON Schema para `response_format.json_schema` de LM Studio. */
const INTENT_JSON_SCHEMA = {
  name: 'ai_intent',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      operation: { type: 'string', enum: [...AI_OPERATIONS] },
      clientName: { type: 'string' },
      title: { type: 'string' },
      links: { type: 'array', items: { type: 'string' } },
      taskId: { type: 'integer' },
      memberNames: { type: 'array', items: { type: 'string' } },
      dueDate: { type: 'string' },
      newDueDate: { type: 'string' },
      status: { type: 'string', enum: [...TASK_STATUSES] },
      reason: { type: 'string' },
    },
    required: ['operation'],
    additionalProperties: false,
  },
};

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

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

  /**
   * Interpreta texto libre del dueño y lo convierte en una intención estructurada.
   *
   * El caller debe consultar `isEnabled()` antes de llamar: si el módulo está
   * desactivado (falta `LMSTUDIO_BASE_URL`) este método devuelve `{ kind: 'error' }`.
   * Nunca lanza: errores de red, timeout o JSON malformado (tras 1 reintento)
   * se loguean y devuelven `{ kind: 'error' }`.
   */
  async interpret(text: string, context: AiContext): Promise<AiIntentResult> {
    if (!this.isEnabled()) {
      this.logger.warn(
        'LMSTUDIO_BASE_URL no configurada: el modo conversacional está desactivado',
      );
      return { kind: 'error' };
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: this.buildSystemPrompt(context) },
      { role: 'user', content: text },
    ];

    for (let attempt = 1; attempt <= 2; attempt++) {
      const content = await this.getCompletion(messages);
      if (content === null) {
        return { kind: 'error' };
      }

      const intent = this.parseAndValidate(content);
      if (intent !== null) {
        if (intent.operation === 'desconocida') {
          return { kind: 'unknown' };
        }
        return { kind: 'intent', intent };
      }

      this.logger.warn(
        `Respuesta de LM Studio sin intención válida (intento ${attempt} de 2)`,
      );
    }

    return { kind: 'error' };
  }

  /**
   * Llama a LM Studio forzando salida JSON; si el servidor rechaza
   * `response_format` (4xx), reintenta una vez sin él confiando en el prompt.
   */
  private async getCompletion(messages: ChatMessage[]): Promise<string | null> {
    let result = await this.requestCompletion(messages, true);
    if (result.status === 'schema_rejected') {
      this.logger.warn(
        'LM Studio rechazó response_format.json_schema: se reintenta sin salida estructurada',
      );
      result = await this.requestCompletion(messages, false);
    }
    return result.status === 'ok' ? result.content : null;
  }

  private async requestCompletion(
    messages: ChatMessage[],
    withJsonSchema: boolean,
  ): Promise<CompletionResult> {
    const baseUrl = (this.config.get<string>('LMSTUDIO_BASE_URL') ?? '')
      .trim()
      .replace(/\/+$/, '');
    const model = this.config.get<string>('LMSTUDIO_MODEL') ?? '';

    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: 0,
    };
    if (withJsonSchema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: INTENT_JSON_SCHEMA,
      };
    }

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        if (withJsonSchema && response.status >= 400 && response.status < 500) {
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
   * Parsea el contenido del modelo (tolerando fences ```json) y valida la
   * intención: operación dentro de la lista y tipos correctos por campo.
   * Campos extra o con tipo inválido se descartan (quedarán undefined y el
   * bot pedirá el dato). Devuelve null si no hay JSON u operación válida.
   */
  private parseAndValidate(content: string): AiIntent | null {
    const raw = this.parseJson(content);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return null;
    }

    const candidate = raw as Record<string, unknown>;
    const operation = candidate.operation;
    if (
      typeof operation !== 'string' ||
      !(AI_OPERATIONS as readonly string[]).includes(operation)
    ) {
      return null;
    }

    const intent: Record<string, unknown> = { operation };
    for (const field of OPERATION_FIELDS[operation as AiOperation]) {
      const value = this.sanitizeField(field, candidate[field]);
      if (value !== undefined) {
        intent[field] = value;
      }
    }
    return intent as AiIntent;
  }

  /** Valida el tipo de un campo; devuelve undefined si es inválido o falta. */
  private sanitizeField(field: string, value: unknown): unknown {
    if (value === undefined || value === null) return undefined;
    switch (field) {
      case 'taskId':
        return typeof value === 'number' &&
          Number.isInteger(value) &&
          value > 0
          ? value
          : undefined;
      case 'dueDate':
      case 'newDueDate':
        return typeof value === 'string' && DATE_REGEX.test(value)
          ? value
          : undefined;
      case 'memberNames':
      case 'links':
        return Array.isArray(value) &&
          value.length > 0 &&
          value.every((v) => typeof v === 'string' && v.trim().length > 0)
          ? value
          : undefined;
      case 'status':
        return typeof value === 'string' &&
          (TASK_STATUSES as readonly string[]).includes(value)
          ? value
          : undefined;
      case 'clientName':
      case 'title':
      case 'reason':
        return typeof value === 'string' && value.trim().length > 0
          ? value
          : undefined;
      default:
        return undefined;
    }
  }

  /** Parsea JSON tolerando fences ```json ... ``` y texto alrededor. */
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

  private buildSystemPrompt(context: AiContext): string {
    const clientList =
      context.clients.map((c) => `#${c.id} ${c.name}`).join('\n') ||
      '(sin clientes)';
    const memberList =
      context.members.map((m) => `#${m.id} ${m.name}`).join('\n') ||
      '(sin personas)';

    return [
      'Eres el intérprete de un asistente interno que recibe peticiones en español del dueño de una agencia para gestionar pendientes (tareas) de clientes.',
      'Tu única salida es UN objeto JSON de intención, sin texto adicional, sin markdown y sin explicaciones.',
      '',
      `Hoy es ${context.today}. Resuelve cualquier fecha relativa ("mañana", "el viernes", "en una semana") a formato YYYY-MM-DD usando esa fecha.`,
      '',
      'Operaciones válidas y sus parámetros (todos los parámetros son opcionales; omite los que el usuario NO mencionó, no inventes títulos, razones ni fechas):',
      '- "crear_pendiente": crear un pendiente. Parámetros: "clientName" (string, nombre del cliente), "title" (string, título del pendiente), "links" (array de strings con URLs).',
      '- "asignar": asignar un pendiente a personas. Parámetros: "taskId" (entero, id del pendiente), "memberNames" (array de strings con nombres de personas), "dueDate" (string YYYY-MM-DD, fecha de entrega).',
      '- "reasignar": cambiar las personas asignadas. Parámetros: "taskId" (entero), "memberNames" (array de strings), "reason" (string, razón del cambio).',
      '- "extender": extender la fecha de entrega. Parámetros: "taskId" (entero), "newDueDate" (string YYYY-MM-DD), "reason" (string, razón de la extensión).',
      '- "terminar": marcar un pendiente como terminado. Parámetros: "taskId" (entero).',
      '- "cambiar_estado": cambiar el estado de un pendiente. Parámetros: "taskId" (entero), "status" (uno de: PENDIENTE, ASIGNADO, TERMINADO, EXTENDIDO), "reason" (string).',
      '- "listar_pendientes": listar pendientes, opcionalmente de un cliente. Parámetros: "clientName" (string).',
      '- "listar_clientes": listar los clientes. Sin parámetros.',
      '- "listar_personas": listar las personas del equipo. Sin parámetros.',
      '- "ayuda": el usuario pide ayuda o pregunta qué puedes hacer. Sin parámetros.',
      '- "desconocida": la petición no corresponde a ninguna operación o es ambigua. Sin parámetros.',
      '',
      'Clientes activos (id y nombre), úsalos para normalizar el nombre que mencione el usuario; devuelve SIEMPRE el nombre como string en "clientName", nunca el id:',
      clientList,
      '',
      'Personas del equipo (id y nombre), úsalas para normalizar nombres; devuelve SIEMPRE nombres como strings en "memberNames", nunca ids:',
      memberList,
      '',
      'Reglas estrictas:',
      '- Responde SOLO el JSON de la intención, con la clave "operation" obligatoria.',
      '- Omite todo campo que el usuario no haya mencionado explícitamente.',
      '- Si la petición no encaja en ninguna operación o es ambigua, responde {"operation":"desconocida"}.',
      '- Si el usuario pide ayuda o pregunta qué puedes hacer, responde {"operation":"ayuda"}.',
    ].join('\n');
  }
}
