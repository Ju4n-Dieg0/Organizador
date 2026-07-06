# SPEC — Contrato de dominio y API

Fuente de verdad del contrato entre backend (`backend/`), frontend (`frontend/`) y bot de Telegram.
El schema autoritativo está en `backend/prisma/schema.prisma`.

## Modelo de dominio

- IDs: `Int @id @default(autoincrement())` en todas las tablas (IDs cortos para comandos de Telegram).
- **Plan**: `name` (único), `description?`. CRUD completo; DELETE devuelve 409 si tiene clientes.
- **Client**: `name`, `active` (default true), `planId?`, N `ClientDriveLink {url, label?}`.
  Nunca se borra: `deactivate`/`activate`.
- **TeamMember**: `name`, `telegramChatId?` (único, interno: NUNCA se expone al frontend), `active`,
  `isOwner` (default false). Solo recibe alertas por Telegram. La vinculación se hace por deep link
  de `/start` (ver § Telegram).
  - `isOwner`: marca qué miembro del equipo ES el dueño (para que el modo conversacional resuelva
    la primera persona y para deduplicar notificaciones). Solo puede haber UNO en `true`: al marcar
    un miembro, el service desmarca al anterior **en la misma transacción**. Desmarcar es libre.
- **TelegramLinkToken**: token de vinculación de un solo uso por miembro (`memberId` único:
  regenerar invalida el anterior). `token` (único, `crypto.randomBytes(24)` en base64url),
  `expiresAt` (48h), `createdAt`. Se borra al usarse, al regenerar o al desvincular.
- **Task** (pendiente): `clientId`, `title`, `description?`, `status`, `dueDate?`,
  N `TaskLink {url, label?}`, N asignados (`TaskAssignee`), historial `TaskEvent[]`.
- **TaskEvent**: `type (CREACION|ASIGNACION|REASIGNACION|EXTENSION|CAMBIO_ESTADO)`,
  `fromStatus?`, `toStatus?`, `reason?`, `detail?`, `createdAt`. Toda mutación de estado/asignación
  crea su evento **en la misma transacción**.
- **TaskComment** (comentario sobre un pendiente): hilo bidireccional y compartido por Task.
  `taskId` (Cascade), `authorType (DUENO|MIEMBRO)`, `memberId?` (TeamMember, solo si
  `authorType = MIEMBRO`; `SetNull` si el miembro desapareciera), `text` (no vacío),
  `createdAt`. `@@index([taskId])`. Los comentarios NO generan `TaskEvent` (no son cambios de
  estado): viven en su propio hilo. Nunca se editan ni borran.
- **TeamRequest** (solicitud del equipo): petición de un miembro vinculado por Telegram que
  requiere aprobación del dueño. `type (CREAR_PENDIENTE|EXTENSION|REASIGNACION|CAMBIO_ESTADO)`,
  `status (PENDIENTE|APROBADA|RECHAZADA, default PENDIENTE)`, `requesterId` (TeamMember),
  `taskId?` (nullable: CREAR_PENDIENTE no afecta un pendiente existente; si el Task se borra,
  `SetNull`), `payload Json` (datos propuestos, tipado y validado al crear — ver abajo),
  `rejectionReason?` (OBLIGATORIA al rechazar), `resolvedBy?` (texto: nombre del usuario web o
  `"Dueño (Telegram)"`), `resolvedAt?`, `createdAt`, `updatedAt`. `@@index([status])`.
  Las solicitudes NUNCA se borran; son historial auditable.

### Estados y transiciones de Task

```
PENDIENTE --assign--> ASIGNADO --complete--> TERMINADO
                      ASIGNADO --extend--> EXTENDIDO --complete--> TERMINADO
                                           EXTENDIDO --extend--> EXTENDIDO (re-extensión)
```

- `assign`: requiere ≥1 `memberIds` y `dueDate`. Evento ASIGNACION.
- `reassign`: permitido en ASIGNADO/EXTENDIDO; requiere `reason`. Reemplaza asignados. Evento REASIGNACION (detail = "de X a Y").
- `extend`: requiere `reason` y `newDueDate`. Evento EXTENSION.
- `complete`: permitido en ASIGNADO/EXTENDIDO. Evento CAMBIO_ESTADO. Acepta un actor opcional
  (`complete(id, actor?: { memberId: number; memberName: string })`): cuando lo ejecuta un
  miembro desde Telegram, el evento lleva `detail = "Terminado por <nombre> vía Telegram"` y la
  notificación al dueño dice «<nombre> marcó como terminado …» (sin actor, comportamiento previo).
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
| PATCH | `/api/team-members/:id/owner` | `{isOwner: boolean}` | TeamMemberResponse — `true` marca este miembro como el dueño y desmarca al anterior (transacción); `false` lo desmarca. |
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
| GET | `/api/tasks/:id/comments` | — | TaskCommentResponse[] (orden `createdAt` asc; 404 si el pendiente no existe) |
| POST | `/api/tasks/:id/comments` | `{text: string}` (no vacía tras trim) | TaskCommentResponse — la web solo la usa el admin: crea comentario con `authorType = DUENO` |

#### Comentarios (módulo `backend/src/tasks/`, service propio `TaskCommentsService`)

- El service de comentarios es ÚNICO: web (controller) y bot de Telegram pasan por él.
  La notificación vive DENTRO del service (nunca duplicada en los callers):

```ts
type CommentAuthor = { type: 'DUENO' } | { type: 'MIEMBRO'; memberId: number };
// TaskCommentsService (exportado por TasksModule):
//   list(taskId): Promise<TaskCommentResponseDto[]>
//   add(taskId, author: CommentAuthor, text: string): Promise<TaskCommentResponseDto>
```

- `add` valida que el pendiente exista (404) y que `text` no quede vacío (400); si el autor es
  MIEMBRO valida que el miembro exista. Luego notifica vía
  `NotificationsService.notifyTaskCommented(task, comment)`:
  - A TODOS los asignados con `telegramChatId`, EXCEPTO el autor (exclusión por `memberId`,
    no por nombre).
  - Si el autor es MIEMBRO, también al dueño («<nombre> comentó en "<título>": <texto>»).
  - Si el autor es DUENO, el dueño no se auto-notifica.
- `authorName` lo computa el backend: `'Administrador'` para DUENO; nombre del miembro para
  MIEMBRO (`'Miembro eliminado'` si `memberId` quedó null).

### Team requests (solicitudes del equipo) — módulo `backend/src/requests/`

| Método | Ruta | Body | Respuesta |
|--------|------|------|-----------|
| GET | `/api/requests?status=PENDIENTE\|APROBADA\|RECHAZADA\|all` | — | TeamRequestResponse[] (default: `all`, orden `createdAt` desc) |
| GET | `/api/requests/:id` | — | TeamRequestResponse |
| POST | `/api/requests/:id/approve` | — | TeamRequestResponse |
| POST | `/api/requests/:id/reject` | `{reason: string}` (no vacía) | TeamRequestResponse |

- Las solicitudes solo se CREAN desde el bot de Telegram (no hay POST REST de creación):
  `RequestsService.create(...)` valida el payload campo a campo contra el tipo (cliente activo,
  miembros activos, fechas `YYYY-MM-DD`, razones no vacías) antes de persistir.
- `approve` ejecuta la operación real **vía los services existentes** (`TasksService.create/assign`,
  `extend`, `reassign`, `changeStatus`) — mismos `TaskEvent`, mismas razones obligatorias y
  validación de transiciones — y luego marca la solicitud. Si la operación real falla
  (p. ej. transición inválida), la solicitud queda PENDIENTE y se propaga el error.
- **Idempotencia**: `approve`/`reject` sobre una solicitud ya resuelta → 409 Conflict con mensaje
  «Esta solicitud ya fue aprobada/rechazada». La web y los botones de Telegram comparten
  exactamente el mismo service (`RequestsService.approve(id, resolvedBy)` /
  `reject(id, reason, resolvedBy)`).
- Al crear → notificación al dueño con resumen + botones inline Aceptar/Rechazar.
  Al resolver → notificación al miembro solicitante por su chat vinculado
  (aprobada / rechazada con la razón). Ver § Telegram.

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
  isOwner: boolean;                     // este miembro es el dueño (máx. uno en true)
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

type CommentAuthorType = 'DUENO' | 'MIEMBRO';
interface TaskCommentResponse {
  id: number; taskId: number;
  authorType: CommentAuthorType;
  authorName: string;            // 'Administrador' (DUENO) o nombre del miembro
  text: string; createdAt: string;
}

type TeamRequestType = 'CREAR_PENDIENTE' | 'EXTENSION' | 'REASIGNACION' | 'CAMBIO_ESTADO';
type TeamRequestStatus = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';

// Payload tipado (se persiste como Json validado; el mapper lo devuelve tipado):
type TeamRequestPayload =
  | { kind: 'CREAR_PENDIENTE'; clientId: number; clientName: string; title: string;
      memberIds: number[]; memberNames: string[]; dueDate: string | null }   // con memberIds+dueDate, approve crea Y asigna
  | { kind: 'EXTENSION'; newDueDate: string; reason: string }
  | { kind: 'REASIGNACION'; memberIds: number[]; memberNames: string[]; reason: string }
  | { kind: 'CAMBIO_ESTADO'; status: TaskStatus; reason: string | null };

interface TeamRequestResponse {
  id: number; type: TeamRequestType; status: TeamRequestStatus;
  requester: { id: number; name: string };
  task: { id: number; title: string; clientName: string; status: TaskStatus } | null;
  payload: TeamRequestPayload;
  summary: string;                  // resumen humano en español que arma el backend (única fuente: web y Telegram muestran el mismo)
  rejectionReason: string | null;
  resolvedBy: string | null; resolvedAt: string | null;
  createdAt: string; updatedAt: string;
}
```

Errores: formato Nest estándar `{statusCode, message, error}`; `message` en español.

## Telegram

Roles por chat:

- **Dueño** (`TELEGRAM_OWNER_CHAT_ID`): comandos completos (separador `|`) + texto libre con
  todas las operaciones. Comandos: `/ayuda /clientes /personas /pendientes [cliente]
  /pendiente /asignar /reasignar /extender /estado /terminar /comentar` — ver `.claude/agents/telegram-bot.md`.
  `/comentar <id> | <mensaje>`: agrega un comentario del dueño al pendiente vía
  `TaskCommentsService.add` (misma notificación a asignados que la web).
- **Miembro vinculado** (`telegramChatId` en TeamMember): recibe alertas/recordatorios Y habla
  con el bot en **texto libre** (modo conversacional de equipo, ver § IA) con capacidades
  RESTRINGIDAS. Los comandos slash NO están disponibles para miembros (si envían uno, el bot
  responde amable que le escriban en lenguaje natural).
- **Chat no vinculado y no dueño**: rechazado como hasta ahora (solo `/start <token>` para vincular).

### Capacidades del modo conversacional de equipo

1. **Consultas (solo lectura, respuesta inmediata)**: sus propios pendientes y los pendientes de
   un cliente concreto. NO puede listar clientes ni personas completos.
2. **Terminar un pendiente (directo, sin aprobación)**: ejecuta `TasksService.complete` con actor;
   el `TaskEvent` registra que lo hizo ese miembro y el dueño recibe
   «<nombre> marcó como terminado "<título>"».
3. **Solicitudes (requieren aprobación)**: nuevo pendiente, extensión, reasignación y cambio de
   estado distinto de terminar → crean un `TeamRequest`. El bot confirma lo entendido con el
   miembro ANTES de enviar la solicitud (multi-turno, fuzzy matching con «¿te refieres a…?»,
   igual de amigable que el modo del dueño).
4. **Comentar un pendiente (directo, sin aprobación)**: sobre SUS pendientes asignados
   (mismo alcance que terminar). Ejecuta `TaskCommentsService.add` con
   `{type: 'MIEMBRO', memberId}`; el comentario queda en el hilo, llega al dueño y a los demás
   asignados (excepto el autor). Si falta el mensaje, el bot lo pregunta (borrador multi-turno);
   al enviarse confirma de forma natural a quiénes llegó («Listo, le pasé tu comentario al
   administrador y a Luis»). NO pasa por `TeamRequest`.

Los pendientes propios/del cliente se referencian por título (fuzzy, `TelegramResolverService`
extendido a tareas) — nunca se piden IDs. Validación de alcance SIEMPRE en la capa telegram:
un miembro solo puede terminar/solicitar sobre pendientes en los que está asignado
(consultas de cliente sí abarcan todos los pendientes de ese cliente).

### Flujo de aprobación de solicitudes

- Al crearse un `TeamRequest`: el dueño recibe el `summary` + botones inline
  **Aceptar / Rechazar** (callback data `req:approve:<id>` / `req:reject:<id>`).
- **Aceptar** → `RequestsService.approve(id, 'Dueño (Telegram)')` (mismo service que la web).
- **Rechazar** → el bot pide la razón en el siguiente mensaje del chat del dueño (estado
  multi-turno que se intercepta ANTES del handler de IA; «cancela» descarta) y llama
  `RequestsService.reject(id, reason, 'Dueño (Telegram)')`.
- **Idempotencia**: si ya fue resuelta (p. ej. desde la web), el callback responde
  «esta solicitud ya fue aprobada/rechazada» (el 409 del service se traduce a respuesta amable).
- Al resolverse (web o Telegram): el miembro recibe «Tu solicitud fue aprobada ✅» /
  «Tu solicitud fue rechazada ❌: <razón>» en su chat vinculado.

`TelegramSender` se extiende para soportar botones:

```ts
interface TelegramSender {
  sendMessage(chatId: string, html: string, options?: {
    inlineKeyboard?: { text: string; callbackData: string }[][];
  }): Promise<void>;
}
```

`NotificationsService` agrega: `notifyTaskCompletedByMember(task, memberName)`,
`notifyRequestCreated(request: TeamRequestResponse)` (dueño, con botones),
`notifyRequestResolved(request)` (miembro solicitante; resuelve su chatId vía
`TeamMembersService.findAllInternal()`, igual que las alertas existentes) y
`notifyTaskCommented(task: TaskResponse, comment: TaskCommentResponse, authorMemberId?: number)`
(asignados con chatId excepto el autor —el DTO no expone `memberId`, por eso viaja como tercer
parámetro—; si el autor es MIEMBRO, también al dueño).

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
- **Deduplicación del dueño-miembro**: `notifyAssignees` (el fan-out a asignados) NUNCA envía al
  chat cuyo `telegramChatId` coincide con `TELEGRAM_OWNER_CHAT_ID`: el dueño ya se entera por su
  notificación de dueño (`sendToOwner`) o es el autor de la acción (p. ej. comentario con
  `authorType = DUENO` cuando su miembro está asignado). Esto cubre asignar/reasignar/extender/
  terminar/comentar. Los **recordatorios diarios** NO usan `notifyAssignees` y SÍ le llegan
  normal a su chat como a cualquier asignado.
- Recordatorios: cron `REMINDER_CRON` (default `0 9 * * *`): tareas ASIGNADO/EXTENDIDO con
  `dueDate` vencida, de hoy o de mañana → resumen al dueño + alerta a cada asignado.

## IA conversacional (LM Studio)

El bot acepta **texto libre** del chat del dueño (todas las operaciones) y de los chats de
miembros vinculados (operaciones restringidas, ver § Contrato de equipo). El texto se interpreta con
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
  openTasks: { id: number; title: string; clientName: string;
               status: TaskStatus; dueDate: string | null }[];
                                              // pendientes ABIERTOS (todos los clientes): el modelo
                                              // decide con esta lista entre `asignar` (trabajo
                                              // EXISTENTE) y `crear_pendiente` (trabajo nuevo) y
                                              // produce taskId/taskRef. Mismo criterio que `myTasks`
                                              // en el modo de equipo.
  today: string;                              // YYYY-MM-DD (resolver fechas relativas)
  ownerMemberName?: string;                   // nombre del miembro con isOwner (si existe y está
                                              // activo): la capa telegram lo llena en buildContext.
                                              // El prompt instruye que la primera persona del dueño
                                              // («yo», «a mí», «me lo asigno», «mis pendientes»,
                                              // «mío») resuelve a este nombre en memberNames/memberName.
}

// Campos no identificadores son opcionales: el LLM puede omitirlos y el bot pregunta lo que falte.
// Un mensaje puede contener VARIAS intenciones (p. ej. dos crear_pendiente en una frase).
type AiIntent =
  | { operation: 'crear_pendiente'; clientName?: string; title?: string; links?: string[];
      memberNames?: string[]; dueDate?: string }  // si vienen, tras crear se ejecuta la asignación
  // Las operaciones sobre un pendiente EXISTENTE aceptan taskId (número explícito
  // o id tomado de openTasks) o taskRef (título en texto libre, p. ej. «asígnale
  // el pendiente de hotmart a Andrea»). La capa telegram resuelve taskRef por
  // fuzzy matching sobre los pendientes abiertos —sin restricción de alcance: son
  // todos— con confirmación «¿te refieres a…?» si es solo parecido y lista de
  // opciones si es ambiguo; con fallback por nombre de cliente («el de la
  // notaría») degradado a confirmación. NUNCA se pide el ID como única vía (el ID
  // sigue funcionando si el dueño lo da). Regla del prompt: estas operaciones solo
  // aplican a pendientes de openTasks; si el mensaje describe trabajo NUEVO
  // («asígnale X a Andrea» donde X no existe) es crear_pendiente con memberNames.
  | { operation: 'asignar'; taskId?: number; taskRef?: string; memberNames?: string[]; dueDate?: string } // YYYY-MM-DD
  | { operation: 'reasignar'; taskId?: number; taskRef?: string; memberNames?: string[]; reason?: string }
  | { operation: 'extender'; taskId?: number; taskRef?: string; newDueDate?: string; reason?: string }
  | { operation: 'terminar'; taskId?: number; taskRef?: string }
  | { operation: 'cambiar_estado'; taskId?: number; taskRef?: string; status?: TaskStatus; reason?: string }
  | { operation: 'comentar'; taskId?: number; taskRef?: string; message?: string }
      // comentario del dueño sobre un pendiente; si falta message lo pregunta
      // (borrador multi-turno) y lo toma LITERAL.
  | { operation: 'listar_pendientes'; clientName?: string; memberName?: string }
      // memberName filtra por persona asignada («¿qué pendientes tiene Andrea?»,
      // «¿qué pendientes tengo yo?» → ownerMemberName). Combinable con clientName
      // («pendientes de Andrea en ToGrow» → ambos filtros, AND). El handler del
      // dueño resuelve el nombre con el resolver fuzzy (confirmación «¿te refieres
      // a…?») y llama TasksService.findAll({ clientId?, memberId? }).
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
  interpretTeam(text: string, context: AiTeamContext): Promise<AiTeamIntentResult>;
}
```

### Contrato de equipo (`interpretTeam`)

Prompt y set de operaciones SEPARADOS del modo dueño (el modelo de equipo nunca ve operaciones
que el miembro no puede pedir). `ai/` sigue sin tocar Prisma: telegram arma el contexto.

```ts
interface AiTeamContext {
  memberName: string;                          // quién habla
  clients: { id: number; name: string }[];     // activos (para consultas/solicitudes por cliente)
  members: { id: number; name: string }[];     // activos (para reasignaciones por nombre)
  myTasks: { id: number; title: string; clientName: string;
             status: TaskStatus; dueDate: string | null }[];  // pendientes abiertos del miembro
  today: string;                               // YYYY-MM-DD
}

// taskId solo si el modelo lo toma de myTasks; taskRef = título en texto libre.
// La capa telegram SIEMPRE valida el alcance (taskId ∈ myTasks) y resuelve taskRef
// por fuzzy matching con confirmación; nunca confía ciegamente en el modelo.
type AiTeamIntent =
  | { operation: 'mis_pendientes' }
  | { operation: 'pendientes_cliente'; clientName?: string }
  | { operation: 'terminar'; taskId?: number; taskRef?: string }
  | { operation: 'comentar'; taskId?: number; taskRef?: string; message?: string }
      // comentario directo (sin aprobación) sobre un pendiente PROPIO
      // («sobre el reel: el cliente aún no manda el logo», «dile al admin que…»).
      // Alcance restringido a myTasks (mismo resolveTaskFor que terminar).
  | { operation: 'solicitar_pendiente'; clientName?: string; title?: string;
      memberNames?: string[]; dueDate?: string }
  | { operation: 'solicitar_extension'; taskId?: number; taskRef?: string;
      newDueDate?: string; reason?: string }
  | { operation: 'solicitar_reasignacion'; taskId?: number; taskRef?: string;
      memberNames?: string[]; reason?: string }
  | { operation: 'solicitar_cambio_estado'; taskId?: number; taskRef?: string;
      status?: TaskStatus; reason?: string }
  | { operation: 'ayuda' }
  | { operation: 'charla' }
  | { operation: 'desconocida' };

type AiTeamIntentResult =
  | { kind: 'intents'; intents: AiTeamIntent[] }
  | { kind: 'smalltalk' } | { kind: 'unknown' } | { kind: 'error' };
```

Misma estrategia de implementación que el modo dueño (intento sin `response_format`, reintento
con `json_schema` strict, validación tolerante con whitelist de campos y normalización de
operaciones inventadas por sinónimos, p. ej. `pedir_extension`→`solicitar_extension`).

Implementación (`fetch` nativo, sin dependencias nuevas, calibrada contra LM Studio —
validada con meta-llama-3.1-8b-instruct; compacta para modelos chicos como phi-3-mini):

- **Intento 1 sin `response_format`**: prompt de sistema compacto + few-shot como pares
  user/assistant (lista corta y validada: demasiados ejemplos descarrilan a los modelos
  pequeños), `temperature: 0`, `max_tokens` acotado (1200: un mensaje enumerado del dueño puede
  producir 6 intenciones y con 600 se truncaba el JSON) y `stop: ["\n\n"]` para cortar
  divagues. Parser tolerante (fences, primer JSON balanceado). Máximo 8 intenciones por mensaje.
- **Reintento con `response_format: json_schema` (strict)**: schema `{ intents: [...] }` con
  enum de operaciones; garantiza JSON parseable (la decodificación restringida degrada la
  calidad de los modelos chicos, por eso es el fallback y no el primer intento).
- **Validación tolerante**: whitelist de campos por operación (campos inventados se descartan),
  tipos campo a campo, fechas `YYYY-MM-DD`, y **normalización de operaciones inventadas** por
  sinónimos (p. ej. `gracias`→`charla`, `terminar_pendiente`→`terminar`, `obtener_clientes`→
  `listar_clientes`, `marcar_como`+`status`→`cambiar_estado`); estados en inglés (`EXTENDED`)
  se mapean al enum. Operación no mapeable → `desconocida`.
- **Red de seguridad del taskId (modo dueño)**: un `taskId` del modelo solo se conserva si el
  número aparece literal en el mensaje del dueño o si es un id real de `openTasks`; cualquier
  otro id se descarta (queda el `taskRef` o el bot pregunta) — nunca se actúa sobre un
  pendiente inventado.
- **Corrección determinista de días de semana (modo dueño)**: los modelos chicos fallan la
  aritmética de calendario («al lunes» → un domingo). Si el mensaje tiene UNA sola intención,
  menciona exactamente un día de la semana y no trae fecha explícita `YYYY-MM-DD`, la fecha
  (`dueDate`/`newDueDate`) se fija a la próxima ocurrencia de ese día (siempre a futuro).

### Reglas del handler de texto libre (Telegram)

- El texto libre del dueño usa `interpret` (todas las operaciones); el de un chat vinculado a un
  miembro usa `interpretTeam` (capacidades restringidas; el handler de equipo se registra ANTES
  del middleware de solo-dueño y hace `next()` si el chat no es de un miembro). Cualquier otro
  chat sigue rechazado. Los textos que empiezan con `/` no pasan por la IA.
- **Nunca se piden IDs como única vía**: clientes y personas se resuelven por nombre, y los
  pendientes también por título (`taskRef`), vía `TelegramResolverService` con fuzzy matching
  (normaliza acentos/mayúsculas, substring, distancia de edición y prefijo común casi total
  para variantes morfológicas «Jabones Artesanales»→«Jabones Artesano», siempre como
  `suggestion` con confirmación). Contrato del resolver:

```ts
type NameResolution<T> =
  | { kind: 'match'; entity: T }        // única coincidencia confiable: se usa directo
  | { kind: 'suggestion'; entity: T }   // parecido razonable: preguntar «¿Te refieres a "X"?»
  | { kind: 'ambiguous'; options: T[] } // varios candidatos: preguntar cuál
  | { kind: 'none' };                   // sin candidatos
```

- **Primera persona del dueño**: la capa telegram resuelve los pronombres de primera persona de
  forma determinista ANTES del fuzzy matching: si un `memberName`/`memberNames[i]` normalizado es
  un pronombre («yo», «mi», «mí», «me», «a mi», «conmigo», «mío», «mía»), se sustituye por el
  miembro con `isOwner` (si está activo). Si NO hay miembro marcado, el bot responde para esa
  intención «Aún no sé cuál miembro del equipo eres tú: márcalo en la sección Equipo» SIN romper
  el resto del mensaje (las demás intenciones se procesan normal). El prompt además recibe
  `ownerMemberName` para que el modelo emita directamente el nombre real cuando exista; el manejo
  de pronombres en la capa telegram es la red de seguridad cuando el modelo devuelve el pronombre
  literal o no hay miembro marcado.
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
