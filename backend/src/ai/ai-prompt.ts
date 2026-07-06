import { TASK_STATUSES } from '../tasks/dto/task-response.dto';
import { AI_OPERATIONS, AiContext } from './ai-intent.types';

/** Mensaje de chat estilo OpenAI para `POST /chat/completions`. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * System prompt calibrado empíricamente contra LM Studio (validado con
 * meta-llama-3.1-8b-instruct; debe mantenerse compacto para modelos chicos).
 * Las listas de clientes/personas/pendientes y la fecha son dinámicas; el
 * resto del texto está probado tal cual.
 */
const WEEKDAY_NAMES = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
];

/** Día de la semana (es) de una fecha YYYY-MM-DD; '' si no parsea. */
function weekdayOf(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '' : WEEKDAY_NAMES[date.getDay()];
}

export function buildSystemPrompt(context: AiContext): string {
  const clients =
    context.clients.map((c) => c.name).join(', ') || '(sin clientes)';
  const members =
    context.members.map((m) => m.name).join(', ') || '(sin personas)';
  const openTasks =
    context.openTasks
      .map((t) => {
        const due = t.dueDate ? `, entrega ${t.dueDate.slice(0, 10)}` : '';
        return `#${t.id} "${t.title}" (${t.clientName}, ${t.status}${due})`;
      })
      .join('; ') || '(ninguno)';
  const identity = context.ownerMemberName
    ? `El dueño que escribe es el miembro del equipo "${context.ownerMemberName}": cuando hable en primera persona («yo», «a mí», «me lo asignas», «asígnamelo», «mis pendientes», «mío», «ponme»), usa "${context.ownerMemberName}" en memberNames/memberName.`
    : 'Si el dueño habla en primera persona («yo», «a mí», «asígnamelo», «mis pendientes», «ponme»), pon el literal "yo" en memberNames/memberName.';

  return [
    'Eres el intérprete de un asistente interno de una agencia. Convierte cada mensaje del dueño (en español) en JSON con una LISTA de intenciones: {"intents":[...]}. Respondes SOLO el JSON en una sola línea, nada más.',
    '',
    'Operaciones válidas (usa SOLO estas, con SOLO sus campos):',
    '- crear_pendiente: clientName, title, memberNames, dueDate, links',
    '- asignar: taskId o taskRef, memberNames, dueDate',
    '- reasignar: taskId o taskRef, memberNames, reason',
    '- extender: taskId o taskRef, newDueDate, reason',
    '- terminar: taskId o taskRef',
    '- cambiar_estado: taskId o taskRef, status (PENDIENTE|ASIGNADO|TERMINADO|EXTENDIDO), reason',
    '- comentar: taskId o taskRef, message (dejar un aviso/comentario en un pendiente para sus asignados)',
    '- listar_pendientes: clientName y/o memberName opcionales (memberName = persona asignada por la que se pregunta)',
    '- listar_clientes, listar_personas, ayuda: sin campos',
    '- charla: saludo, gracias o conversación casual; sin campos',
    '- desconocida: nada de lo anterior; sin campos',
    '',
    `Hoy es ${weekdayOf(context.today)} ${context.today}. Fechas siempre YYYY-MM-DD; resuelve fechas relativas ("mañana", "el viernes", "el lunes") a partir de hoy, siempre a futuro.`,
    `Clientes activos: ${clients}. Personas del equipo: ${members}.`,
    `Pendientes ABIERTOS: ${openTasks}.`,
    identity,
    '',
    'Reglas:',
    '- "para <Persona>" o "<Persona> tiene que..." → memberNames (persona asignada), NO cliente.',
    '- "para el cliente X" o un nombre de la lista de clientes → clientName.',
    '- En clientName y memberNames escribe el nombre EXACTO como aparece en las listas de arriba, aunque el mensaje lo escriba distinto ("notaría" → "Notaria").',
    '- "qué pendientes tiene <nombre>": si <nombre> es una persona del equipo → listar_pendientes con memberName; si es un cliente → clientName.',
    '- asignar/reasignar/extender/terminar/cambiar_estado/comentar SOLO aplican a un pendiente que YA EXISTE en la lista de pendientes ABIERTOS: taskId si dicen el número, o taskRef = el título que nombraron (sin el cliente).',
    '- Si describe trabajo NUEVO (no está en la lista de pendientes ABIERTOS), es crear_pendiente aunque diga "asigna/asígnale/asígnaselo a <Persona>": la persona va en memberNames.',
    '- Mensaje con varios puntos enumerados ("primero...", "segundo...", "1.", "-") → una intención POR PUNTO; un cierre tipo "todos son para <Persona>" pone ese memberNames en TODAS.',
    '- "ponme/agrégame/súmame también en <pendiente>" → UNA sola intención reasignar con taskRef (nunca crear_pendiente).',
    '- taskId SOLO si el mensaje dice un número explícito; si nombran el pendiente por título, usa taskRef.',
    '- El título resume qué hay que hacer; no incluyas el nombre del cliente en el título.',
    '- "dile/diles a los del <pendiente> que...", "coméntale a <pendiente> que...", "avísales que..." → comentar: taskRef = el pendiente nombrado (sin el cliente), message = el aviso citado breve.',
    '- Nunca inventes campos, ids, fechas ni razones: omite lo que no se dijo.',
    '- Si piden varias tareas en un mensaje, devuelve varias intenciones.',
  ].join('\n');
}

/**
 * Few-shot como pares user/assistant. Lista corta y validada (10 ejemplos):
 * con demasiados ejemplos los modelos pequeños se descarrilan (divagan en
 * inglés / prosa). Los nombres propios de los shots son ejemplos de formato
 * y pueden no coincidir con el contexto real: la validación los normaliza.
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
  {
    role: 'user',
    content:
      'hazme el favor de encargarle varias cosas a Marta\n\nprimero ajustar el guion del podcast para Rivera\n\nsegundo armar el calendario de julio para Acme\n\ntodo eso va para Marta',
  },
  {
    role: 'assistant',
    content:
      '{"intents":[{"operation":"crear_pendiente","clientName":"Rivera","memberNames":["Marta"],"title":"Ajustar el guion del podcast"},{"operation":"crear_pendiente","clientName":"Acme","memberNames":["Marta"],"title":"Armar el calendario de julio"}]}',
  },
  { role: 'user', content: 'Hola, gracias' },
  { role: 'assistant', content: '{"intents":[{"operation":"charla"}]}' },
  {
    role: 'user',
    content: 'asígnale el pendiente del catálogo a Luis para el 2026-07-02',
  },
  {
    role: 'assistant',
    content:
      '{"intents":[{"operation":"asignar","taskRef":"catálogo","memberNames":["Luis"],"dueDate":"2026-07-02"}]}',
  },
  {
    role: 'user',
    content: 'extiende el 12 al 2026-06-25 porque el cliente pidió cambios',
  },
  {
    role: 'assistant',
    content:
      '{"intents":[{"operation":"extender","taskId":12,"newDueDate":"2026-06-25","reason":"el cliente pidió cambios"}]}',
  },
  {
    role: 'user',
    content: 'agrega a marta también al pendiente de las historias',
  },
  {
    role: 'assistant',
    content:
      '{"intents":[{"operation":"reasignar","taskRef":"historias","memberNames":["Marta"]}]}',
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
  {
    role: 'user',
    content: 'diles a los del banner de Acme que el cliente aprobó la propuesta',
  },
  {
    role: 'assistant',
    content:
      '{"intents":[{"operation":"comentar","taskRef":"banner","message":"el cliente aprobó la propuesta"}]}',
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
            taskRef: { type: 'string' },
            memberNames: { type: 'array', items: { type: 'string' } },
            memberName: { type: 'string' },
            dueDate: { type: 'string' },
            newDueDate: { type: 'string' },
            status: { type: 'string', enum: [...TASK_STATUSES] },
            reason: { type: 'string' },
            message: { type: 'string' },
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
