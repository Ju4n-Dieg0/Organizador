# SPEC — Contrato de dominio y API

Fuente de verdad del contrato entre backend (`backend/`), frontend (`frontend/`) y bot de Telegram.
El schema autoritativo está en `backend/prisma/schema.prisma`.

## Modelo de dominio

- IDs: `Int @id @default(autoincrement())` en todas las tablas (IDs cortos para comandos de Telegram).
- **Plan**: `name` (único), `description?`. CRUD completo; DELETE devuelve 409 si tiene clientes.
- **Client**: `name`, `active` (default true), `planId?`, N `ClientDriveLink {url, label?}`.
  Nunca se borra: `deactivate`/`activate`.
- **TeamMember**: `name`, `telegramChatId?` (único), `active`. Solo recibe alertas por Telegram.
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
| POST | `/api/team-members` | `{name, telegramChatId?}` | TeamMemberResponse |
| GET | `/api/team-members?status=active\|inactive\|all` | — | TeamMemberResponse[] |
| GET | `/api/team-members/:id` | — | TeamMemberResponse |
| PATCH | `/api/team-members/:id` | `{name?, telegramChatId?: string\|null}` | TeamMemberResponse |
| PATCH | `/api/team-members/:id/deactivate` / `activate` | — | TeamMemberResponse |

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
interface TeamMemberResponse { id: number; name: string; telegramChatId: string | null; active: boolean; activeTaskCount: number; createdAt: string }
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

Notificaciones salientes (vía `NotificationsService`):
- crear → dueño; asignar/reasignar/extender/terminar → dueño + asignados con chatId.
- Recordatorios: cron `REMINDER_CRON` (default `0 9 * * *`): tareas ASIGNADO/EXTENDIDO con
  `dueDate` vencida, de hoy o de mañana → resumen al dueño + alerta a cada asignado.

## IA conversacional (LM Studio)

El bot acepta **texto libre** (sin slash) SOLO del chat del dueño. El texto se interpreta con
LM Studio (API compatible OpenAI, `POST {LMSTUDIO_BASE_URL}/chat/completions`) y se transforma
en una intención estructurada que se ejecuta contra los services existentes (misma lógica de
negocio que los comandos: TaskEvent, razones obligatorias, transiciones validadas).

### Contrato del módulo `backend/src/ai/`

- `ai/` NO toca Prisma ni repositorios: recibe el contexto desde quien lo invoca.
- Si falta `LMSTUDIO_BASE_URL`, el módulo se desactiva (`isEnabled() === false`) sin romper el arranque.

```ts
interface AiContext {
  clients: { id: number; name: string }[];   // activos, para normalizar nombres
  members: { id: number; name: string }[];   // activos
  today: string;                              // YYYY-MM-DD (resolver fechas relativas)
}

// Campos no identificadores son opcionales: el LLM puede omitirlos y el bot pide lo que falte.
type AiIntent =
  | { operation: 'crear_pendiente'; clientName?: string; title?: string; links?: string[] }
  | { operation: 'asignar'; taskId?: number; memberNames?: string[]; dueDate?: string }      // YYYY-MM-DD
  | { operation: 'reasignar'; taskId?: number; memberNames?: string[]; reason?: string }
  | { operation: 'extender'; taskId?: number; newDueDate?: string; reason?: string }
  | { operation: 'terminar'; taskId?: number }
  | { operation: 'cambiar_estado'; taskId?: number; status?: TaskStatus; reason?: string }
  | { operation: 'listar_pendientes'; clientName?: string }
  | { operation: 'listar_clientes' }
  | { operation: 'listar_personas' }
  | { operation: 'ayuda' }
  | { operation: 'desconocida' };

type AiIntentResult =
  | { kind: 'intent'; intent: AiIntent }
  | { kind: 'unknown' }    // el modelo no entendió la petición
  | { kind: 'error' };     // LM Studio inaccesible o JSON malformado tras 1 reintento

interface AiService {
  isEnabled(): boolean;
  interpret(text: string, context: AiContext): Promise<AiIntentResult>;
}
```

Implementación: `fetch` nativo (sin dependencias nuevas) con salida JSON forzada
(`response_format: json_schema`, fallback a prompt estricto + validación) y 1 reintento.

### Reglas del handler de texto libre (Telegram)

- Misma restricción de seguridad que los comandos (`TELEGRAM_OWNER_CHAT_ID`); los textos que
  empiezan con `/` no pasan por la IA.
- Resolución de nombres → IDs SIEMPRE vía los helpers existentes del bot (manejo de ambigüedad).
- La ejecución pasa por los services existentes; cero lógica de negocio duplicada.
- Datos faltantes (p. ej. extender sin razón) → el bot responde qué falta, no ejecuta.
- `unknown`/`desconocida` → respuesta amable sugiriendo /ayuda. IA desactivada → aviso de que
  el modo conversacional no está disponible + sugerencia de /ayuda.

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
