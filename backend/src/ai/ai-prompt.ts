import { TASK_STATUSES } from '../tasks/dto/task-response.dto';
import { AI_OPERATIONS, AiContext } from './ai-intent.types';

/** Mensaje de chat estilo OpenAI para `POST /chat/completions`. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * System prompt calibrado empíricamente contra phi-3-mini-4k-instruct
 * (contexto 4k: debe mantenerse compacto). Las listas de clientes/personas
 * y la fecha son dinámicas; el resto del texto está probado tal cual.
 */
export function buildSystemPrompt(context: AiContext): string {
  const clients =
    context.clients.map((c) => c.name).join(', ') || '(sin clientes)';
  const members =
    context.members.map((m) => m.name).join(', ') || '(sin personas)';

  return [
    'Eres el intérprete de un asistente interno de una agencia. Convierte cada mensaje del dueño (en español) en JSON con una LISTA de intenciones: {"intents":[...]}. Respondes SOLO el JSON en una sola línea, nada más.',
    '',
    'Operaciones válidas (usa SOLO estas, con SOLO sus campos):',
    '- crear_pendiente: clientName, title, memberNames, dueDate, links',
    '- asignar: taskId, memberNames, dueDate',
    '- reasignar: taskId, memberNames, reason',
    '- extender: taskId, newDueDate, reason',
    '- terminar: taskId',
    '- cambiar_estado: taskId, status (PENDIENTE|ASIGNADO|TERMINADO|EXTENDIDO), reason',
    '- listar_pendientes: clientName opcional',
    '- listar_clientes, listar_personas, ayuda: sin campos',
    '- charla: saludo, gracias o conversación casual; sin campos',
    '- desconocida: nada de lo anterior; sin campos',
    '',
    `Hoy es ${context.today}. Fechas siempre YYYY-MM-DD.`,
    `Clientes activos: ${clients}. Personas del equipo: ${members}.`,
    '',
    'Reglas:',
    '- "para <Persona>" o "<Persona> tiene que..." → memberNames (persona asignada), NO cliente.',
    '- "para el cliente X" o un nombre de la lista de clientes → clientName.',
    '- El título resume qué hay que hacer; no incluyas el nombre del cliente en el título.',
    '- Nunca inventes campos, ids, fechas ni razones: omite lo que no se dijo.',
    '- Si piden varias tareas en un mensaje, devuelve varias intenciones.',
  ].join('\n');
}

/**
 * Few-shot como pares user/assistant. EXACTAMENTE 6 ejemplos validados:
 * con más ejemplos phi-3-mini se descarrila (divaga en inglés / prosa).
 * Los nombres propios de los shots son ejemplos de formato y pueden no
 * coincidir con el contexto real: la validación posterior los normaliza.
 *
 * IMPORTANTE: las frases user de los shots NO deben ser idénticas a frases
 * reales que el dueño usa: cuando el mensaje coincide literalmente con un
 * shot, phi-3-mini se descarrila y responde prosa (observado de forma
 * reproducible). Estas redacciones están validadas A/B contra LM Studio.
 */
export const FEW_SHOT_MESSAGES: readonly ChatMessage[] = [
  {
    role: 'user',
    content: 'crea un pendiente para Andrea: informe mensual de pauta',
  },
  {
    role: 'assistant',
    content:
      '{"intents":[{"operation":"crear_pendiente","memberNames":["Andrea"],"title":"Informe mensual de pauta"}]}',
  },
  {
    role: 'user',
    content:
      'andrea tiene que subir el reel y programar las historias para togrow',
  },
  {
    role: 'assistant',
    content:
      '{"intents":[{"operation":"crear_pendiente","clientName":"ToGrow","memberNames":["Andrea"],"title":"Subir el reel"},{"operation":"crear_pendiente","clientName":"ToGrow","memberNames":["Andrea"],"title":"Programar las historias"}]}',
  },
  { role: 'user', content: 'Hola, gracias' },
  { role: 'assistant', content: '{"intents":[{"operation":"charla"}]}' },
  {
    role: 'user',
    content: 'extiende el 12 al 2026-06-25 porque el cliente pidió cambios',
  },
  {
    role: 'assistant',
    content:
      '{"intents":[{"operation":"extender","taskId":12,"newDueDate":"2026-06-25","reason":"el cliente pidió cambios"}]}',
  },
  { role: 'user', content: 'reasigna el 3 a luis porque andrea está enferma' },
  {
    role: 'assistant',
    content:
      '{"intents":[{"operation":"reasignar","taskId":3,"memberNames":["Luis"],"reason":"andrea está enferma"}]}',
  },
  { role: 'user', content: 'qué pendientes tiene togrow' },
  {
    role: 'assistant',
    content:
      '{"intents":[{"operation":"listar_pendientes","clientName":"ToGrow"}]}',
  },
];

/**
 * JSON Schema para `response_format.json_schema` de LM Studio.
 * SOLO se usa como reintento/fallback: la decodificación restringida
 * degrada la calidad de phi-3-mini, pero garantiza JSON parseable.
 */
export const INTENTS_JSON_SCHEMA = {
  name: 'ai_intents',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      intents: {
        type: 'array',
        items: {
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
      },
    },
    required: ['intents'],
    additionalProperties: false,
  },
} as const;
