# Organizador — Gestión de Clientes de Agencia

Software interno para gestionar clientes, planes, pendientes (tareas) y equipo,
con bot de Telegram para operar pendientes por comandos y recibir recordatorios.

## Stack

| Capa | Tecnología |
|------|-----------|
| Backend | NestJS 11 + TypeScript, Prisma ORM, PostgreSQL |
| Frontend | React 19 + Vite + TypeScript, Ant Design 5, Framer Motion, TanStack Query |
| Bot | Telegraf (long polling) integrado en el backend NestJS |
| IA | LM Studio local (API compatible OpenAI) para el modo conversacional del bot |
| Auth | JWT, usuario admin por defecto sembrado desde variables de entorno |
| Infra | docker-compose (PostgreSQL) |

⚠️ **Entorno**: esta máquina corre Claude Code dentro del Flatpak de VSCode.
`node`/`npm`/`docker` NO existen dentro del sandbox — ejecútalos en el host con:

```bash
host-spawn bash -lc 'cd /home/togrowagencia/Documentos/Organizador/backend && npm run build'
```

## Comandos

```bash
# Infra
host-spawn bash -lc 'cd <proyecto> && docker compose up -d'        # PostgreSQL

# Backend (cd backend)
npm run start:dev          # dev server :3000 (prefijo /api)
npm run build              # compilar
npx prisma migrate dev     # migraciones
npx prisma db seed         # seed (usuario admin desde .env)
npx prisma generate        # regenerar cliente Prisma

# Frontend (cd frontend)
npm run dev                # Vite :5173
npm run build              # tsc + vite build
```

Regla RTK: prefija comandos de terminal con `rtk` (referencia completa en `~/.claude/RTK.md`).

## Arquitectura

### Backend (`backend/`) — desacoplado por capas con patrón DTO

Cada módulo de dominio (`plans`, `clients`, `team-members`, `tasks`) sigue:

```
src/<modulo>/
├── dto/                    # DTOs de entrada (class-validator) y de respuesta
├── <modulo>.repository.ts  # ÚNICA capa que toca Prisma
├── <modulo>.mapper.ts      # Entidad Prisma → Response DTO (Prisma nunca sale del módulo)
├── <modulo>.service.ts     # Lógica de negocio (usa repository, devuelve DTOs)
├── <modulo>.controller.ts  # HTTP, validación, sin lógica
└── <modulo>.module.ts
```

Reglas:
- Los controllers NUNCA usan PrismaService ni tipos de Prisma; solo DTOs.
- Los services NUNCA llaman a Prisma directo; siempre vía repository.
- `notifications/` abstrae el envío a Telegram (interfaz `Notifier`); `telegram/` implementa bot + comandos + modo conversacional; `reminders/` cron de recordatorios.
- `ai/` integra LM Studio (texto libre → intención estructurada `AiIntent`); NO toca Prisma: recibe el contexto desde quien lo invoca. Contrato en `docs/SPEC.md`.
- Auth global con `JwtAuthGuard` + decorador `@Public()` para login/health.

### Frontend (`frontend/`) — 4 capas: api → service → hook → component

```
src/
├── api/          # axios + funciones por recurso (única capa que conoce HTTP)
├── services/     # transformaciones/lógica de presentación sobre la api
├── hooks/        # TanStack Query hooks (única capa que usan los componentes)
├── components/   # por feature: clients/, plans/, team/, tasks/, layout/, common/
├── pages/        # composición de componentes por ruta
├── types/        # interfaces TS por dominio (espejo de los Response DTOs del back)
├── constants/    # rutas, estados, config de api, textos
└── theme/        # tokens de AntD derivados del design system
```

Reglas:
- Componentes NUNCA importan de `api/`; solo de `hooks/`, `types/`, `constants/`.
- Sin hex crudos en componentes: usar tokens del tema (`theme/`).
- Iconos: `@ant-design/icons` (SVG). Prohibido usar emojis como iconos.
- Animaciones con Framer Motion: 150–300ms, `ease-out` al entrar, respetar `prefers-reduced-motion`.

### Design System

`design-system/organizador/MASTER.md` es la fuente de verdad visual
(estilo Data-Dense Dashboard, primario `#2563EB`, acento `#059669`, fondo `#F8FAFC`).
Antes de crear una página revisa si existe `design-system/organizador/pages/<pagina>.md` (override).
Para decisiones de UI/UX usa la skill `/ui-ux-pro-max`.

## Dominio

- **Cliente**: nombre, plan (opcional), N links de carpeta Drive, activo/inactivo (soft toggle, nunca delete).
- **Plan**: nombre + descripción; un plan se asocia a muchos clientes.
- **Persona (TeamMember)**: miembro del equipo; puede tener `telegramChatId` (solo recibe alertas).
- **Pendiente (Task)**: pertenece a un cliente; título, N links de documentos, personas asignadas (N:M), fecha de entrega.
  - Estados: `PENDIENTE → ASIGNADO → TERMINADO`, y `EXTENDIDO` (requiere razón + nueva fecha).
  - Reasignar requiere razón. Todo cambio queda en `TaskEvent` (historial auditable).
- **Telegram**: solo el chat del dueño (`TELEGRAM_OWNER_CHAT_ID`) ejecuta comandos
  (`/pendiente`, `/asignar`, `/reasignar`, `/estado`, `/extender`, `/terminar`, `/pendientes`, `/clientes`, `/personas`, `/ayuda`).
  Los chats del equipo SOLO reciben alertas y recordatorios (cron `REMINDER_CRON`, default 9:00).
  El chat del dueño también acepta **texto libre** (modo conversacional): el módulo `ai/` lo
  interpreta con LM Studio como una LISTA de intenciones (un mensaje puede traer varias) y las
  ejecuta contra los services existentes (misma lógica de negocio, mismos `TaskEvent` y razones
  obligatorias). En este modo clientes y personas se resuelven SIEMPRE por nombre con fuzzy
  matching (nunca se piden sus IDs); las sugerencias y datos faltantes quedan en un borrador
  multi-turno que el siguiente mensaje confirma («sí»), completa o descarta («cancela»). El
  prompt está calibrado contra phi-3-mini (few-shot ≤6 pares, `json_schema` solo como reintento:
  el constrained decoding degrada a modelos pequeños). Si falta `LMSTUDIO_BASE_URL`, el modo se
  desactiva solo y el bot sugiere `/ayuda`.

Contrato API completo: `docs/SPEC.md`. Schema: `backend/prisma/schema.prisma`.

## Agentes

Usa los subagentes de `.claude/agents/` para trabajo por área; `orquestador` coordina tareas multi-área:

| Agente | Cuándo |
|--------|--------|
| `orquestador` | Features que tocan back + front + bot; planifica y delega |
| `backend-nestjs` | Módulos NestJS, Prisma, DTOs, migraciones |
| `frontend-react` | Páginas, componentes AntD, hooks, animaciones |
| `telegram-bot` | Comandos del bot, notificaciones, recordatorios |
| `ui-ux-reviewer` | Revisión de accesibilidad/UX antes de entregar UI |

## Variables de entorno (backend/.env)

Ver `backend/.env.example`: `DATABASE_URL`, `JWT_SECRET`, `DEFAULT_ADMIN_EMAIL`,
`DEFAULT_ADMIN_PASSWORD`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_CHAT_ID`, `REMINDER_CRON`, `CORS_ORIGIN`,
`LMSTUDIO_BASE_URL` (ej. `http://localhost:1234/v1`), `LMSTUDIO_MODEL`.
El bot y los recordatorios se desactivan solos si falta `TELEGRAM_BOT_TOKEN`; el modo conversacional
se desactiva solo si falta `LMSTUDIO_BASE_URL` (nada rompe el arranque).
