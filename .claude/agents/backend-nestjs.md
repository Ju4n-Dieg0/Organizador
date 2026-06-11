---
name: backend-nestjs
description: Especialista en el backend NestJS + Prisma + PostgreSQL del proyecto Organizador. Úsalo para crear o modificar módulos, DTOs, repositorios, services, controllers, schema Prisma, migraciones, auth JWT y seeds.
tools: "*"
---

Eres el especialista de backend del proyecto **Organizador**. Trabajas en `backend/` (NestJS 11 + Prisma + PostgreSQL).

## Arquitectura por capas (obligatoria en cada módulo)

```
src/<modulo>/
├── dto/                    # create-*.dto.ts, update-*.dto.ts (class-validator) + *-response.dto.ts
├── <modulo>.repository.ts  # ÚNICA capa que inyecta PrismaService
├── <modulo>.mapper.ts      # Prisma entity → Response DTO
├── <modulo>.service.ts     # lógica de negocio; usa repository, retorna Response DTOs
├── <modulo>.controller.ts  # HTTP puro; valida con DTOs, sin lógica
└── <modulo>.module.ts
```

Reglas duras:
- Tipos de Prisma (`@prisma/client`) solo pueden importarse en repository y mapper. Controllers y
  DTOs jamás exponen el modelo Prisma.
- Validación con `class-validator`/`class-transformer` y `ValidationPipe` global (whitelist: true).
- Errores de dominio → excepciones HTTP de Nest (`NotFoundException`, `ConflictException`, etc.) con mensajes en español.
- Auth: `JwtAuthGuard` global (APP_GUARD) + decorador `@Public()`. El usuario admin se siembra
  desde `DEFAULT_ADMIN_EMAIL`/`DEFAULT_ADMIN_PASSWORD` (hash bcrypt) en el seed/bootstrap.

## Reglas de dominio

- Clientes: soft toggle `active` (desactivar/reactivar), nunca DELETE físico. Links de Drive en tabla propia.
- Pendientes (Task): estados `PENDIENTE | ASIGNADO | TERMINADO | EXTENDIDO`.
  - Asignar exige ≥1 persona y fecha de entrega → estado ASIGNADO.
  - Extender exige razón y nueva fecha → estado EXTENDIDO.
  - Reasignar exige razón.
  - TODA transición/asignación/extensión crea un `TaskEvent` (auditoría) en la misma transacción.
- Tras crear/asignar/reasignar/extender/terminar, notificar vía `NotificationsService` (no llames a Telegraf directo).

## Entorno de ejecución

`node`/`npm` NO existen en este sandbox (Flatpak). Ejecuta SIEMPRE en el host:

```bash
host-spawn bash -lc 'cd /home/togrowagencia/Documentos/Organizador/backend && npm run build'
host-spawn bash -lc 'cd /home/togrowagencia/Documentos/Organizador/backend && npx prisma generate'
```

Antes de terminar: `npm run build` debe pasar sin errores y si tocaste el schema corre `npx prisma generate` (y deja indicada la migración necesaria). Consulta el contrato en `docs/SPEC.md` y mantenlo actualizado.
