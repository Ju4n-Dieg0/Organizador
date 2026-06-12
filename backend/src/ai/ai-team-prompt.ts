import { TASK_STATUSES } from '../tasks/dto/task-response.dto';
import { AI_TEAM_OPERATIONS, AiTeamContext } from './ai-intent.types';
import { ChatMessage } from './ai-prompt';

/**
 * System prompt del modo conversacional de EQUIPO. Separado del modo dueño:
 * solo conoce las operaciones que un miembro puede pedir (consultas, terminar
 * y solicitudes que aprueba el administrador). Las listas de clientes,
 * personas y pendientes propios son dinámicas; el resto del texto está
 * calibrado contra LM Studio (ver pruebas en la PR de esta feature).
 */
export function buildTeamSystemPrompt(context: AiTeamContext): string {
  const clients =
    context.clients.map((c) => c.name).join(', ') || '(sin clientes)';
  const members =
    context.members.map((m) => m.name).join(', ') || '(sin personas)';
  const myTasks =
    context.myTasks
      .map((t) => {
        const due = t.dueDate ? `, entrega ${t.dueDate.slice(0, 10)}` : '';
        return `#${t.id} "${t.title}" (${t.clientName}, ${t.status}${due})`;
      })
      .join('; ') || '(ninguno)';

  return [
    `Eres el intérprete de un asistente interno de una agencia. Quien escribe es ${context.memberName}, MIEMBRO del equipo (no el administrador). Convierte cada mensaje (en español) en JSON con una LISTA de intenciones: {"intents":[...]}. Respondes SOLO el JSON en una sola línea, nada más.`,
    '',
    'Operaciones válidas (usa SOLO estas, con SOLO sus campos):',
    '- mis_pendientes: sin campos (quiere ver sus propios pendientes)',
    '- pendientes_cliente: clientName (quiere ver los pendientes de un cliente)',
    '- terminar: taskId o taskRef (ya terminó/entregó un pendiente suyo)',
    '- comentar: taskId o taskRef, message (quiere dejar un aviso/comentario sobre un pendiente suyo, para el administrador o los demás asignados)',
    '- solicitar_pendiente: clientName, title, memberNames, dueDate (propone crear un pendiente nuevo)',
    '- solicitar_extension: taskId o taskRef, newDueDate, reason (pide más tiempo / mover la fecha)',
    '- solicitar_reasignacion: taskId o taskRef, memberNames, reason (pide pasar un pendiente suyo a otra persona)',
    '- solicitar_cambio_estado: taskId o taskRef, status (PENDIENTE|ASIGNADO|TERMINADO|EXTENDIDO), reason',
    '- ayuda: pregunta qué puedes hacer; sin campos',
    '- charla: saludo, gracias o conversación casual; sin campos',
    '- desconocida: nada de lo anterior; sin campos',
    '',
    `Hoy es ${context.today}. Fechas siempre YYYY-MM-DD; resuelve fechas relativas ("mañana", "el viernes", "el lunes") con la fecha de hoy. Si no se menciona fecha, omítela.`,
    `Clientes activos: ${clients}. Personas del equipo: ${members}.`,
    `Pendientes abiertos de ${context.memberName}: ${myTasks}.`,
    '',
    'Reglas:',
    '- taskId SOLO si es uno de los pendientes listados arriba; si lo nombran por texto, usa taskRef con ese texto.',
    '- "necesito más tiempo", "no llego", "dame hasta..." → solicitar_extension.',
    '- "pásale/pásaselo a <Persona>", "que lo haga <Persona>" → solicitar_reasignacion con memberNames.',
    '- "hay que crear/hacer..." para un cliente → solicitar_pendiente (el título resume qué hay que hacer, sin el nombre del cliente).',
    '- "ya terminé / ya está listo / ya lo entregué" → terminar. PERO "ya casi", "todavía no", "aún no" NO es terminar: suele ser comentar.',
    '- "sobre <pendiente>: ...", "dile al administrador que...", "avisa que..." → comentar: message = lo que quiere decir, citado breve.',
    '- La razón (reason) es el motivo que dio la persona, citado breve.',
    '- Nunca inventes campos, ids, fechas ni razones: omite lo que no se dijo.',
  ].join('\n');
}

/**
 * Few-shot del modo de equipo como pares user/assistant. Mismo criterio que
 * el modo dueño: pocos ejemplos, una intención JSON por línea, y frases que
 * NO coinciden literalmente con las que usaría un miembro real.
 */
export const TEAM_FEW_SHOT_MESSAGES: readonly ChatMessage[] = [
  { role: 'user', content: 'qué tareas tengo yo esta semana' },
  { role: 'assistant', content: '{"intents":[{"operation":"mis_pendientes"}]}' },
  { role: 'user', content: 'qué pendientes hay del cliente Rivera' },
  {
    role: 'assistant',
    content:
      '{"intents":[{"operation":"pendientes_cliente","clientName":"Rivera"}]}',
  },
  { role: 'user', content: 'ya quedó listo el banner de la promo' },
  {
    role: 'assistant',
    content:
      '{"intents":[{"operation":"terminar","taskRef":"banner de la promo"}]}',
  },
  {
    role: 'user',
    content:
      'no me da tiempo con el informe, dame hasta el 2026-07-03 porque faltan datos del cliente',
  },
  {
    role: 'assistant',
    content:
      '{"intents":[{"operation":"solicitar_extension","taskRef":"informe","newDueDate":"2026-07-03","reason":"faltan datos del cliente"}]}',
  },
  {
    role: 'user',
    content: 'que el video de bienvenida lo haga Marta porque salgo de viaje',
  },
  {
    role: 'assistant',
    content:
      '{"intents":[{"operation":"solicitar_reasignacion","taskRef":"video de bienvenida","memberNames":["Marta"],"reason":"salgo de viaje"}]}',
  },
  {
    role: 'user',
    content:
      'habría que crear un pendiente para Rivera: actualizar el catálogo, para el 2026-07-01',
  },
  {
    role: 'assistant',
    content:
      '{"intents":[{"operation":"solicitar_pendiente","clientName":"Rivera","title":"Actualizar el catálogo","dueDate":"2026-07-01"}]}',
  },
  {
    role: 'user',
    content: 'sobre el banner: el cliente todavía no manda las fotos',
  },
  {
    role: 'assistant',
    content:
      '{"intents":[{"operation":"comentar","taskRef":"banner","message":"el cliente todavía no manda las fotos"}]}',
  },
];

/**
 * JSON Schema del modo de equipo para `response_format.json_schema`.
 * Igual que en el modo dueño, SOLO se usa como reintento/fallback.
 */
export const TEAM_INTENTS_JSON_SCHEMA = {
  name: 'ai_team_intents',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      intents: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            operation: { type: 'string', enum: [...AI_TEAM_OPERATIONS] },
            clientName: { type: 'string' },
            title: { type: 'string' },
            taskId: { type: 'integer' },
            taskRef: { type: 'string' },
            memberNames: { type: 'array', items: { type: 'string' } },
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
