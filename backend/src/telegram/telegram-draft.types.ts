import { AiIntent, AiTeamIntent } from '../ai/ai-intent.types';
import { ClientResponseDto } from '../clients/dto/client-response.dto';
import type { CreateTeamRequestInput } from '../requests/requests.service';
import { TaskResponseDto } from '../tasks/dto/task-response.dto';
import { TeamMemberResponseDto } from '../team-members/dto/team-member-response.dto';

/**
 * Qué está esperando el borrador conversacional:
 * - `confirm-client` / `confirm-member`: hay una sugerencia fuzzy guardada
 *   (entidad ya resuelta). Un "sí" la confirma y la cola continúa SIN volver
 *   a llamar al LLM; un "no" pasa a `name-fix`.
 * - `name-fix`: el siguiente mensaje es el nombre correcto del cliente o de la
 *   persona (`query` indica cuál entrada de `memberNames` se reemplaza).
 * - `due-date`: pendientes ya CREADOS que esperan fecha para completar la
 *   asignación (taskIds + memberIds ya resueltos).
 * - `reinterpret`: faltan campos libres (título, razón, ID…): el siguiente
 *   mensaje se interpreta junto al texto guardado y se reprocesa.
 */
export type DraftAwaiting =
  | { kind: 'confirm-client'; query: string; entity: ClientResponseDto }
  | { kind: 'confirm-member'; query: string; entity: TeamMemberResponseDto }
  | { kind: 'name-fix'; target: 'client' | 'member'; query: string }
  | {
      kind: 'due-date';
      taskIds: number[];
      memberIds: number[];
      /** Nombres ya resueltos, para la respuesta de confirmación. */
      memberNames: string[];
    }
  | { kind: 'reinterpret' };

/**
 * Borrador de conversación multi-turno (con TTL). Guarda el texto a fusionar
 * si hay que reinterpretar, la cola de intenciones pendientes (la actual en
 * la posición 0, salvo en `due-date`, donde ya se ejecutó la creación) y las
 * resoluciones de nombres ya confirmadas (clave: nombre normalizado).
 */
export interface ConversationDraft {
  createdAt: number;
  text: string;
  /** true si `text` es el mensaje completo del usuario (se puede re-fusionar). */
  fullText: boolean;
  intents: AiIntent[];
  clientCache: Record<string, ClientResponseDto>;
  memberCache: Record<string, TeamMemberResponseDto>;
  awaiting: DraftAwaiting;
}

// ---------------------------------------------------------------------------
// Borrador del modo conversacional de EQUIPO (uno por chat de miembro).
// Mismo patrón multi-turno con TTL que el del dueño, pero los datos que
// faltan se completan campo a campo (sin re-llamar al LLM) y las solicitudes
// siempre terminan en una confirmación explícita antes de enviarse.
// ---------------------------------------------------------------------------

/**
 * Qué espera el borrador de equipo:
 * - `task-confirm`: sugerencia fuzzy de tarea propia («¿te refieres a…?»).
 * - `task-pick`: el siguiente mensaje es el título de la tarea (re-fuzzy).
 * - `client-confirm` / `client-name`: igual que el dueño, para clientes.
 * - `member-confirm` / `member-name`: igual, para personas (`query` indica
 *   qué entrada de `memberNames` se reemplaza; vacía = agregar).
 * - `assignee-or-skip`: solicitud de pendiente con fecha pero sin persona
 *   («no sé» descarta la fecha y envía sin asignación propuesta).
 * - `field`: el siguiente mensaje es el valor literal del campo indicado.
 * - `confirm-send`: resumen mostrado; «sí» envía la solicitud, «cancela»
 *   la descarta.
 */
export type TeamDraftAwaiting =
  | { kind: 'task-confirm'; query: string; task: TaskResponseDto }
  | { kind: 'task-pick' }
  | { kind: 'client-confirm'; query: string; clientName: string }
  | { kind: 'client-name' }
  | { kind: 'member-confirm'; query: string; memberName: string }
  | { kind: 'member-name'; query: string }
  | { kind: 'assignee-or-skip' }
  | { kind: 'field'; field: 'title' | 'newDueDate' | 'dueDate' | 'reason' | 'status' }
  | { kind: 'confirm-send'; input: CreateTeamRequestInput; summary: string };

/**
 * Borrador multi-turno de un chat de miembro. La intención actual es la
 * posición 0 de `intents`; `myTasks` es el snapshot de pendientes abiertos
 * del miembro usado para validar alcance y resolver títulos.
 */
export interface TeamConversationDraft {
  createdAt: number;
  intents: AiTeamIntent[];
  myTasks: TaskResponseDto[];
  awaiting: TeamDraftAwaiting;
}
