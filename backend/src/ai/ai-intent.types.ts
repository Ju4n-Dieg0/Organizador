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
 * el LLM puede omitirlos y el bot pide al usuario lo que falte.
 */
export type AiIntent =
  | {
      operation: 'crear_pendiente';
      clientName?: string;
      title?: string;
      links?: string[];
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
  | { operation: 'desconocida' };

export type AiIntentResult =
  | { kind: 'intent'; intent: AiIntent }
  /** El modelo no entendió la petición (operation = desconocida). */
  | { kind: 'unknown' }
  /** LM Studio inaccesible o JSON malformado tras 1 reintento. */
  | { kind: 'error' };
