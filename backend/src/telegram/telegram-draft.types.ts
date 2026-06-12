import { AiIntent } from '../ai/ai-intent.types';
import { ClientResponseDto } from '../clients/dto/client-response.dto';
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
