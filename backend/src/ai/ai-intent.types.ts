import { TaskStatus } from '../tasks/dto/task-response.dto';

/** Operaciones que el modelo puede devolver como intención. */
export const AI_OPERATIONS = [
  'crear_pendiente',
  'asignar',
  'reasignar',
  'extender',
  'terminar',
  'cambiar_estado',
  'listar_pendientes',
  'listar_clientes',
  'listar_personas',
  'ayuda',
  'charla',
  'desconocida',
] as const;
export type AiOperation = (typeof AI_OPERATIONS)[number];

/** Contexto que el caller arma con sus services (ai/ no toca Prisma). */
export interface AiContext {
  clients: { id: number; name: string }[];
  members: { id: number; name: string }[];
  /** Fecha de hoy en formato YYYY-MM-DD, para resolver fechas relativas. */
  today: string;
}

/**
 * Intención estructurada. Los campos no identificadores son opcionales:
 * el LLM puede omitirlos y el bot pregunta al usuario lo que falte.
 *
 * `crear_pendiente` acepta también `memberNames` y `dueDate`: si vienen,
 * tras crear el pendiente el bot ejecuta la asignación con la misma lógica
 * de negocio (si falta `dueDate`, crea el pendiente y pregunta la fecha
 * para completar la asignación).
 */
export type AiIntent =
  | {
      operation: 'crear_pendiente';
      clientName?: string;
      title?: string;
      links?: string[];
      memberNames?: string[];
      dueDate?: string; // YYYY-MM-DD
    }
  | {
      operation: 'asignar';
      taskId?: number;
      memberNames?: string[];
      dueDate?: string; // YYYY-MM-DD
    }
  | {
      operation: 'reasignar';
      taskId?: number;
      memberNames?: string[];
      reason?: string;
    }
  | {
      operation: 'extender';
      taskId?: number;
      newDueDate?: string; // YYYY-MM-DD
      reason?: string;
    }
  | { operation: 'terminar'; taskId?: number }
  | {
      operation: 'cambiar_estado';
      taskId?: number;
      status?: TaskStatus;
      reason?: string;
    }
  | { operation: 'listar_pendientes'; clientName?: string }
  | { operation: 'listar_clientes' }
  | { operation: 'listar_personas' }
  | { operation: 'ayuda' }
  /** Saludo, agradecimiento o charla casual: respuesta amable, sin acción. */
  | { operation: 'charla' }
  | { operation: 'desconocida' };

/**
 * Resultado de interpretar un mensaje. Un mensaje puede contener VARIAS
 * intenciones ("andrea tiene que hacer X y Y para togrow" → 2 crear_pendiente).
 */
export type AiIntentResult =
  /** ≥1 intención ejecutable (se filtran charla/desconocida si hay otras). */
  | { kind: 'intents'; intents: AiIntent[] }
  /** El mensaje es solo saludo/charla: responder amable, sin ejecutar nada. */
  | { kind: 'smalltalk' }
  /** El modelo no entendió la petición (solo intenciones desconocidas). */
  | { kind: 'unknown' }
  /** LM Studio inaccesible o JSON malformado tras el reintento. */
  | { kind: 'error' };
