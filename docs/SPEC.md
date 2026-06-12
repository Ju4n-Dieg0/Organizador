# SPEC — Contrato de dominio y API

Fuente de verdad del contrato entre backend (`backend/`), frontend (`frontend/`) y bot de Telegram.
El schema autoritativo está en `backend/prisma/schema.prisma`.

## Modelo de dominio

- IDs: `Int @id @default(autoincrement())` en todas las tablas (IDs cortos para comandos de Telegram).
- **Plan**: `name` (único), `description?`. CRUD completo; DELETE devuelve 409 si tiene clientes.
- **Client**: `name`, `active` (default true), `planId?`, N `ClientDriveLink {url, label?}`.
  Nunca se borra: `deactivate`/`activate`.
- **TeamMember**: `name`, `telegramChatId?` (único, interno: NUNCA se expone al frontend), `active`.
  Solo recibe alertas por Telegram. La vinculación se hace por deep link de `/start` (ver § Telegram).
- **TelegramLinkToken**: token de vinculación de un solo uso por miembro (`memberId` único:
  regenerar invalida el anterior). `token` (único, `crypto.randomBytes(24)` en base64url),
  `expiresAt` (48h), `createdAt`. Se borra al usarse, al regenerar o al desvincular.
- **Task** (pendiente): `clientId`, `title`, `description?`, `status`, `dueDate?`,
  N `TaskLink {url, label?}`, N asignados (`TaskAssignee`), historial `TaskEvent[]`.
- **TaskEvent**: `type (CREACION|ASIGNACION|REASIGNACION|EXTENSION|CAMBIO_ESTADO)`,
  `fromStatus?`, `toStatus?`, `reason?`, `detail?`, `createdAt`. Toda mutación de estado/asignación
  crea su evento **en la misma transacción**.

### Estados y transiciones de Task

```
PENDIENTE --assign--> ASIGNADO --complete--> TERMINADO
                      ASIGNADO --extend--> EXTENDIDO --complete--> TERMINADO
                                           EXTENDIDO --extend--> EXTENDIDO (re-extensión)
```

- `assign`: requiere ≥1 `memberIds` y `dueDate`. Evento ASIGNACION.
- `reassign`: permitido en ASIGNADO/EXTENDIDO; requiere `reason`. Reemplaza asignados. Evento REASIGNACION (detail = "de X a Y").
- `extend`: requiere `reason` y `newDueDate`. Evento EXTENSION.
- `complete`: permitido en ASIGNADO/EXTENDIDO. Evento CAMBIO_ESTADO.
- `status` genérico: valida transiciones permitidas; si `toStatus = EXTENDIDO` exige `reason`.
- Transición inválida → 409 Conflict con mensaje en español.

## API REST (prefijo global `/api`, JSON, JWT Bearer salvo @Public)

### Auth
| Método | Ruta | Body | Respuesta |
|--------|------|------|-----------|
| POST | `/api/auth/login` (Public) | `{email, password}` | `{accessToken, user: {id, email, name}}` |
| GET | `/api/auth/me` | — | `{id, email, name}` |

### Plans
| POST | `/api/plans` | `{name, description?}` | PlanResponse |
| GET | `/api/plans` | — | PlanResponse[] |
| GET | `/api/plans/:id` | — | PlanResponse |
| PATCH | `/api/plans/:id` | `{name?, description?}` | PlanResponse |
| DELETE | `/api/plans/:id` | — | 204 (409 si tiene clientes) |

### Clients
| POST | `/api/clients` | `{name, planId?, driveLinks?: {url, label?}[]}` | ClientResponse |
| GET | `/api/clients?status=active\|inactive\|all&search=` | — | ClientResponse[] (default: all) |
| GET | `/api/clients/:id` | — | ClientResponse |
| PATCH | `/api/clients/:id` | `{name?, planId?: number\|null, driveLinks?: {url,label?}[]}` (driveLinks reemplaza la lista) | ClientResponse |
| PATCH | `/api/clients/:id/deactivate` | — | ClientResponse |
| PATCH | `/api/clients/:id/activate` | — | ClientResponse |

### Team members
| POST | `/api/team-members` | `{name}` | TeamMemberResponse |
| GET | `/api/team-members?status=active\|inactive\|all` | — | TeamMemberResponse[] |
| GET | `/api/team-members/:id` | — | TeamMemberResponse |
| PATCH | `/api/team-members/:id` | `{name?}` | TeamMemberResponse |
| PATCH | `/api/team-members/:id/deactivate` / `activate` | — | TeamMemberResponse |
| POST | `/api/team-members/:id/telegram-link` | — | `TelegramLinkResponse {link: string, expiresAt: string}` — genera (o regenera, invalidando el anterior) el token y arma `https://t.me/<bot_username>?start=<token>`. 503 si el bot está desactivado (sin `TELEGRAM_BOT_TOKEN`). |
| DELETE | `/api/team-members/:id/telegram-link` | — | 204 — desvincula: borra `telegramChatId` y el token pendiente. |

El `bot_username` se obtiene del bot real (`getMe()`), expuesto vía la abstracción
`BotInfoService` del mini-módulo `backend/src/telegram-info/` (sin imports propios, mismo patrón
registry que `TelegramSender`: `TelegramService` se registra como proveedor al iniciar).
team-members importa `TelegramInfoModule`, nunca Telegraf ni el módulo telegram (que ya importa
team-members; un import directo sería circular). Si no hay proveedor registrado (bot desactivado),
`getBotUsername()` devuelve `null` y el endpoint responde 503 con mensaje claro en español.

```ts
// telegram-info/bot-info.interface.ts
interface BotInfoProvider { getBotUsername(): Promise<string | null> }
// BotInfoService (holder): setProvider(p) / getBotUsername(): Promise<string | null>
```

Nota interna: `NotificationsService` y `formatTeam` del bot NO usan el Response DTO para los
chatIds: usan un método interno de `TeamMembersService` (p. ej. `findAllInternal()` →
`{id, name, active, telegramChatId}[]`, sin pasar por el controller) y el flag `telegramLinked`
del DTO respectivamente.

### Tasks (pendientes)
| POST | `/api/tasks` | `{clientId, title, description?, links?: {url,label?}[]}` | TaskResponse |
| GET | `/api/tasks?status=&clientId=&memberId=&search=` | — | TaskResponse[] |
| GET | `/api/tasks/:id` | — | TaskDetailResponse (incluye events) |
| PATCH | `/api/tasks/:id` | `{title?, description?, links?}` (links reemplaza) | TaskResponse |
| POST | `/api/tasks/:id/assign` | `{memberIds: number[], dueDate: string(ISO)}` | TaskResponse |
| POST | `/api/tasks/:id/reassign` | `{memberIds: number[], reason: string}` | TaskResponse |
| POST | `/api/tasks/:id/extend` | `{newDueDate: string(ISO), reason: string}` | TaskResponse |
| POST | `/api/tasks/:id/complete` | — | TaskResponse |
| POST | `/api/tasks/:id/status` | `{status, reason?}` | TaskResponse |

## Response DTOs (espejo exacto en `frontend/src/types/`)

```ts
type TaskStatus = 'PENDIENTE' | 'ASIGNADO' | 'TERMINADO' | 'EXTENDIDO';
type TaskEventType = 'CREACION' | 'ASIGNACION' | 'REASIGNACION' | 'EXTENSION' | 'CAMBIO_ESTADO';

interface PlanResponse { id: number; name: string; description: string | null; clientCount: number; createdAt: string; updatedAt: string }
interface DriveLinkResponse { id: number; url: string; label: string | null }
interface ClientResponse {
  id: number; name: string; active: boolean;
  plan: { id: number; name: string } | null;
  driveLinks: DriveLinkResponse[];
  openTaskCount: number;           // tasks con status != TERMINADO
  createdAt: string; updatedAt: string;
}
interface TeamMemberResponse {
  id: number; name: string; active: boolean; activeTaskCount: number;
  telegramLinked: boolean;              // tiene telegramChatId guardado (el chatId crudo NUNCA se expone)
  telegramLinkPending: boolean;         // hay token vigente sin usar
  telegramLinkExpiresAt: string | null; // expiración del token vigente (solo si pending)
  createdAt: string;
}
interface TelegramLinkResponse { link: string; expiresAt: string }
interface TaskLinkResponse { id: number; url: string; label: string | null }
interface TaskAssigneeResponse { memberId: number; name: string; assignedAt: string }
interface TaskResponse {
  id: number; title: string; description: string | null;
  status: TaskStatus; dueDate: string | null;
  client: { id: number; name: string };
  links: TaskLinkResponse[]; assignees: TaskAssigneeResponse[];
  createdAt: string; updatedAt: string;
}
interface TaskEventResponse { id: number; type: TaskEventType; fromStatus: TaskStatus | null; toStatus: TaskStatus | null; reason: string | null; detail: string | null; createdAt: string }
interface TaskDetailResponse extends TaskResponse { events: TaskEventResponse[] }
```

Errores: formato Nest estándar `{statusCode, message, error}`; `message` en español.

## Telegram

Solo `TELEGRAM_OWNER_CHAT_ID` ejecuta comandos (separador `|`); los `telegramChatId` de los
miembros solo reciben alertas. Comandos: `/ayuda /clientes /personas /pendientes [cliente]
/pendiente /asignar /reasignar /extender /estado /terminar` — ver `.claude/agents/telegram-bot.md`.

### Vinculación del equipo por deep link de /start

ÚNICA excepción al middleware de solo-dueño: el handler de `/start` se registra ANTES del
middleware y acepta mensajes de cualquier chat. Todo lo demás (comandos, texto libre) sigue
restringido al dueño.

- `/start <token>` (cualquier chat): valida el token (existe y no venció; al usarse se borra →
  un solo uso). Si es válido, guarda el `chat.id` como `telegramChatId` del miembro (vía
  `TeamMembersService`, nunca Prisma directo desde telegram), borra el token y confirma:
  «Listo, <nombre>: quedaste vinculado/a y recibirás recordatorios aquí».
  - **Re-vinculación**: si ese chat ya estaba vinculado a OTRO miembro, se desvincula del
    anterior y se vincula al nuevo (el chatId es único), avisando en la confirmación.
    Racional: el token lo emitió el dueño a propósito; rechazar solo bloquearía correcciones.
  - Token inválido o vencido: respuesta amable pidiendo solicitar un nuevo enlace al dueño.
- `/start` sin token: chat del dueño → /ayuda (comportamiento previo); cualquier otro chat →
  respuesta amable indicando que pida un enlace de vinculación al dueño.

Notificaciones salientes (vía `NotificationsService`):
- crear → dueño; asignar/reasignar/extender/terminar → dueño + asignados con chatId.
- Recordatorios: cron `REMINDER_CRON` (default `0 9 * * *`): tareas ASIGNADO/EXTENDIDO con
  `dueDate` vencida, de hoy o de mañana → resumen al dueño + alerta a cada asignado.

## IA conversacional (LM Studio)

El bot acepta **texto libre** (sin slash) SOLO del chat del dueño. El texto se interpreta con
LM Studio (API compatible OpenAI, `POST {LMSTUDIO_BASE_URL}/chat/completions`) y se transforma
en una LISTA de intenciones estructuradas que se ejecutan contra los services existentes (misma
lógica de negocio que los comandos: TaskEvent, razones obligatorias, transiciones validadas).
La flexibilidad está SOLO en la interpretación y en las respuestas: nunca se ejecuta nada
que no haya pasado la validación estructurada.

### Contrato del módulo `backend/src/ai/`

- `ai/` NO toca Prisma ni repositorios: recibe el contexto desde quien lo invoca.
- Si falta `LMSTUDIO_BASE_URL`, el módulo se desactiva (`isEnabled() === false`) sin romper el arranque.

```ts
interface AiContext {
  clients: { id: number; name: string }[];   // activos, para normalizar nombres
  members: { id: number; name: string }[];   // activos
  today: string;                              // YYYY-MM-DD (resolver fechas relativas)
}

// Campos no identificadores son opcionales: el LLM puede omitirlos y el bot pregunta lo que falte.
// Un mensaje puede contener VARIAS intenciones (p. ej. dos crear_pendiente en una frase).
type AiIntent =
  | { operation: 'crear_pendiente'; clientName?: string; title?: string; links?: string[];
      memberNames?: string[]; dueDate?: string }  // si vienen, tras crear se ejecuta la asignación
  | { operation: 'asignar'; taskId?: number; memberNames?: string[]; dueDate?: string }      // YYYY-MM-DD
  | { operation: 'reasignar'; taskId?: number; memberNames?: string[]; reason?: string }
  | { operation: 'extender'; taskId?: number; newDueDate?: string; reason?: string }
  | { operation: 'terminar'; taskId?: number }
  | { operation: 'cambiar_estado'; taskId?: number; status?: TaskStatus; reason?: string }
  | { operation: 'listar_pendientes'; clientName?: string }
  | { operation: 'listar_clientes' }
  | { operation: 'listar_personas' }
  | { operation: 'ayuda' }
  | { operation: 'charla' }        // saludo/gracias/charla casual: respuesta amable, sin acción
  | { operation: 'desconocida' };

type AiIntentResult =
  | { kind: 'intents'; intents: AiIntent[] }  // ≥1 intención ejecutable (charla/desconocida filtradas si hay otras)
  | { kind: 'smalltalk' }  // el mensaje es solo saludo/charla
  | { kind: 'unknown' }    // el modelo no entendió la petición (solo desconocidas)
  | { kind: 'error' };     // LM Studio inaccesible o JSON malformado tras el reintento

interface AiService {
  isEnabled(): boolean;
  interpret(text: string, context: AiContext): Promise<AiIntentResult>;
}
```

Implementación (`fetch` nativo, sin dependencias nuevas, calibrada contra phi-3-mini):

- **Intento 1 sin `response_format`**: prompt de sistema compacto + few-shot como pares
  user/assistant (≤6 ejemplos: más ejemplos descarrilan a phi-3-mini), `temperature: 0`,
  `max_tokens` acotado y `stop: ["\n\n"]` para cortar divagues. Parser tolerante (fences,
  primer JSON balanceado).
- **Reintento con `response_format: json_schema` (strict)**: schema `{ intents: [...] }` con
  enum de operaciones; garantiza JSON parseable (la decodificación restringida degrada la
  calidad de phi-3-mini, por eso es el fallback y no el primer intento).
- **Validación tolerante**: whitelist de campos por operación (campos inventados se descartan),
  tipos campo a campo, fechas `YYYY-MM-DD`, y **normalización de operaciones inventadas** por
  sinónimos (p. ej. `gracias`→`charla`, `terminar_pendiente`→`terminar`, `obtener_clientes`→
  `listar_clientes`, `marcar_como`+`status`→`cambiar_estado`); estados en inglés (`EXTENDED`)
  se mapean al enum. Operación no mapeable → `desconocida`.

### Reglas del handler de texto libre (Telegram)

- Misma restricción de seguridad que los comandos (`TELEGRAM_OWNER_CHAT_ID`); los textos que
  empiezan con `/` no pasan por la IA.
- **Nunca se piden IDs de cliente ni de persona**: todo se resuelve por nombre vía
  `TelegramResolverService` con fuzzy matching (normaliza acentos/mayúsculas, substring,
  distancia de edición). Contrato del resolver:

```ts
type NameResolution<T> =
  | { kind: 'match'; entity: T }        // única coincidencia confiable: se usa directo
  | { kind: 'suggestion'; entity: T }   // parecido razonable: preguntar «¿Te refieres a "X"?»
  | { kind: 'ambiguous'; options: T[] } // varios candidatos: preguntar cuál
  | { kind: 'none' };                   // sin candidatos
```

- **Borradores multi-turno**: las intenciones incompletas (faltan campos) o en espera de
  confirmación de nombre se guardan como borrador por chat (con TTL). El siguiente mensaje
  completa el dato, confirma («sí», «dale», «ok» ejecuta la sugerencia) o descarta
  («cancela», «olvídalo»). Si `clientName` no coincide con ningún cliente pero sí con una
  persona del equipo, el bot lo detecta y pregunta en vez de fallar.
- `crear_pendiente` con `memberNames`: tras crear el pendiente se ejecuta la asignación con
  la misma lógica de negocio; si falta `dueDate`, crea el pendiente y pregunta la fecha para
  completar la asignación en el siguiente turno.
- Varias intenciones en un mensaje → se ejecutan en orden, confirmando/preguntando lo que
  falte de forma agrupada y natural («Detecté 2 pendientes para ToGrow asignados a Andrea…»).
- La ejecución pasa por los services existentes; cero lógica de negocio duplicada.
- Respuestas conversacionales que citan lo que el usuario dijo, no plantillas genéricas.
  `smalltalk` → saludo amable + qué puede hacer. `unknown` → respuesta amable que invita a
  reformular. IA desactivada → aviso de que el modo conversacional no está disponible
  + sugerencia de /ayuda.

## Variables de entorno (backend/.env)

```
DATABASE_URL=postgresql://organizador:organizador@localhost:5432/organizador?schema=public
PORT=3000
CORS_ORIGIN=http://localhost:5173
JWT_SECRET=...
JWT_EXPIRES_IN=7d
DEFAULT_ADMIN_EMAIL=admin@togrowagencia.com
DEFAULT_ADMIN_PASSWORD=...
DEFAULT_ADMIN_NAME=Admin
TELEGRAM_BOT_TOKEN=          # vacío = bot y recordatorios desactivados
TELEGRAM_OWNER_CHAT_ID=
REMINDER_CRON=0 9 * * *
LMSTUDIO_BASE_URL=          # vacío = modo conversacional desactivado (ej: http://localhost:1234/v1)
LMSTUDIO_MODEL=             # nombre del modelo cargado en LM Studio
```

Frontend: `VITE_API_URL=http://localhost:3000/api` (`frontend/.env`).
