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

## Bot conversacional (LM Studio)

Además de los comandos slash, el bot entiende **lenguaje natural** (solo desde el chat del dueño):
escribe lo que necesitas y un LLM local vía [LM Studio](https://lmstudio.ai) lo transforma en una
o **varias** intenciones estructuradas que se ejecutan con la misma lógica de negocio que los
comandos (historial `TaskEvent`, razones obligatorias para reasignar/extender, validación de
transiciones). Clientes y personas se indican **siempre por nombre** (el bot nunca pide sus IDs):
si el nombre no coincide exactamente, busca parecidos (acentos, mayúsculas, errores de tipeo) y
pregunta «¿Te refieres a "ToGrow"?» — un «sí» confirma y ejecuta.

### Configurar LM Studio

1. Instala LM Studio y descarga un modelo con buen soporte de instrucciones en español.
   El prompt está calibrado y probado contra `phi-3-mini-4k-instruct`; un modelo mayor
   (Llama 3.1 8B Instruct o Qwen 2.5 7B Instruct) mejora la extracción en frases complejas.
2. Arranca el servidor local: pestaña **Developer → Start Server** (por defecto `http://localhost:1234`).
3. En `backend/.env`:

   ```
   LMSTUDIO_BASE_URL=http://localhost:1234/v1
   LMSTUDIO_MODEL=nombre-del-modelo-cargado
   ```

Sin `LMSTUDIO_BASE_URL`, el modo conversacional se desactiva solo (el backend arranca igual y los
comandos slash siguen funcionando); el bot responde a texto libre indicando que el modo no está
disponible y sugiere `/ayuda`.

### Ejemplos de frases y su comando equivalente

| Frase en lenguaje natural | Comando equivalente |
|---------------------------|---------------------|
| "crea un pendiente para Acme: subir el reel del viernes" | `/pendiente Acme \| Subir el reel del viernes` |
| "asigna el 12 a Ana y Luis para el 20 de junio" | `/asignar 12 \| Ana, Luis \| 2026-06-20` |
| "reasigna el 12 a Marta porque Ana está de vacaciones" | `/reasignar 12 \| Marta \| Ana está de vacaciones` |
| "extiende el 12 al 25 de junio porque el cliente pidió cambios" | `/extender 12 \| 2026-06-25 \| Cliente pidió cambios` |
| "termina el 12" / "el 12 ya quedó" | `/terminar 12` |
| "¿qué pendientes tiene Acme?" | `/pendientes Acme` |
| "muéstrame los clientes" | `/clientes` |
| "¿quiénes están en el equipo?" | `/personas` |

### Frases con varias intenciones, asignación al crear y confirmación de nombres

Una sola frase puede crear **varios pendientes** y dejar lista la asignación:

> **Tú:** andrea tiene que crear unas conversiones de meta y arreglar el multiidioma
> del scrapping para togrow
>
> **Bot:** Detecté 2 pendientes para ToGrow asignados a Andrea: 1) Crear conversiones
> de Meta, 2) Arreglar el multiidioma del scrapping. Los creé. ¿Para qué fecha se los asigno?
>
> **Tú:** mañana
>
> **Bot:** 📌 Listo, ambos asignados a Andrea para mañana. (eventos `CREACION` + `ASIGNACION`)

Si un nombre no coincide exactamente, el bot propone el más parecido:

> **Tú:** crea un pendiente para togro: revisar la pauta
>
> **Bot:** ¿Te refieres a "ToGrow"?
>
> **Tú:** sí → ejecuta. («cancela» u «olvídalo» descarta el borrador en cualquier momento)

Los saludos y agradecimientos («hola», «gracias») reciben una respuesta amable presentando
qué puede hacer el bot, sin plantillas de error. Si falta un dato obligatorio (p. ej. extender
sin razón), el bot pregunta de forma conversacional citando lo que dijiste; el siguiente mensaje
puede aportar solo el dato faltante. La ejecución siempre pasa por intenciones JSON validadas:
nada se ejecuta si es ambiguo.

## Documentación

- Contrato API y dominio: [docs/SPEC.md](docs/SPEC.md)
- Convenciones y arquitectura: [CLAUDE.md](CLAUDE.md)
- Design system: [design-system/organizador/MASTER.md](design-system/organizador/MASTER.md)
- Agentes de Claude Code: [.claude/agents/](.claude/agents/)
