# Organizador

Software interno de gestión de clientes para la agencia: clientes, planes, equipo y
pendientes con historial auditable, más bot de Telegram para operar y recibir recordatorios.

## Stack

- **Backend**: NestJS + Prisma + PostgreSQL (arquitectura por capas con patrón DTO)
- **Frontend**: React + Vite + Ant Design + Framer Motion (capas api → service → hook → component)
- **Bot**: Telegraf integrado en el backend (comandos solo desde el chat del dueño; el equipo recibe alertas)

## Puesta en marcha

```bash
# 1. Base de datos
docker compose up -d

# 2. Backend (puerto 3000)
cd backend
cp .env.example .env        # editar credenciales (ya hay un .env generado)
npm install
npx prisma migrate dev
npx prisma db seed          # crea el usuario admin desde el .env
npm run start:dev

# 3. Frontend (puerto 5173)
cd ../frontend
npm install
npm run dev
```

Login web: `DEFAULT_ADMIN_EMAIL` / `DEFAULT_ADMIN_PASSWORD` del `backend/.env`.

## Telegram

1. Crea un bot con [@BotFather](https://t.me/BotFather) y pega el token en `TELEGRAM_BOT_TOKEN`.
2. Escríbele al bot desde tu cuenta y obtén tu chat id (p. ej. con [@userinfobot](https://t.me/userinfobot)); ponlo en `TELEGRAM_OWNER_CHAT_ID`.
3. Para que un miembro del equipo reciba alertas, registra su `telegramChatId` en la sección Equipo
   (el miembro debe iniciar conversación con el bot primero).
4. Comandos disponibles (solo tu chat): `/ayuda`, `/clientes`, `/personas`, `/pendientes [cliente]`,
   `/pendiente`, `/asignar`, `/reasignar`, `/extender`, `/estado`, `/terminar`.
5. Recordatorios automáticos según `REMINDER_CRON` (default 9:00) para entregas vencidas, de hoy y de mañana.

Sin token configurado, el bot y los recordatorios se desactivan solos y la web funciona normal.

## Documentación

- Contrato API y dominio: [docs/SPEC.md](docs/SPEC.md)
- Convenciones y arquitectura: [CLAUDE.md](CLAUDE.md)
- Design system: [design-system/organizador/MASTER.md](design-system/organizador/MASTER.md)
- Agentes de Claude Code: [.claude/agents/](.claude/agents/)
# Organizador
