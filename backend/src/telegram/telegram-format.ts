import { HttpException, Logger } from '@nestjs/common';
import { Context } from 'telegraf';
import { ClientResponseDto } from '../clients/dto/client-response.dto';
import { TaskResponseDto } from '../tasks/dto/task-response.dto';
import { TeamMemberResponseDto } from '../team-members/dto/team-member-response.dto';

/** Error de uso/validación: se muestra tal cual al usuario, sin stack. */
export class UsageError extends Error {}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export const STATUS_EMOJI: Record<string, string> = {
  PENDIENTE: '🆕',
  ASIGNADO: '📌',
  EXTENDIDO: '⏳',
  TERMINADO: '✅',
};

export const AYUDA = [
  '<b>Comandos disponibles</b> (separador de argumentos: |)',
  '',
  '/clientes — clientes activos',
  '/personas — miembros del equipo',
  '/pendientes [cliente] — pendientes abiertos (filtro opcional)',
  '/pendiente &lt;cliente&gt; | &lt;título&gt; | [link1, link2] — crear pendiente',
  '  Ej: /pendiente Acme | Subir reel | https://drive.google.com/x',
  '/asignar &lt;id&gt; | &lt;persona[, persona2]&gt; | &lt;fecha YYYY-MM-DD&gt;',
  '  Ej: /asignar 12 | Ana, Luis | 2026-06-20',
  '/reasignar &lt;id&gt; | &lt;persona&gt; | &lt;razón&gt;',
  '  Ej: /reasignar 12 | Marta | Ana está de vacaciones',
  '/extender &lt;id&gt; | &lt;fecha YYYY-MM-DD&gt; | &lt;razón&gt;',
  '  Ej: /extender 12 | 2026-06-25 | Cliente pidió cambios',
  '/estado &lt;id&gt; | &lt;estado&gt; | [razón] — cambio de estado genérico',
  '  Ej: /estado 12 | TERMINADO',
  '/terminar &lt;id&gt; — marcar como TERMINADO',
  '/comentar &lt;id&gt; | &lt;mensaje&gt; — comentar un pendiente (avisa a los asignados)',
  '  Ej: /comentar 12 | El cliente cambió el logo',
  '',
  'También puedes escribirme en lenguaje natural, sin comandos.',
  '  Ej: "crea un pendiente para Acme: subir el reel del viernes"',
].join('\n');

export function taskLine(t: TaskResponseDto): string {
  const emoji = STATUS_EMOJI[t.status] ?? '';
  const due = t.dueDate ? ` — 📅 ${t.dueDate.slice(0, 10)}` : '';
  const people = t.assignees.length
    ? ` — 👤 ${escapeHtml(t.assignees.map((a) => a.name).join(', '))}`
    : '';
  return `${emoji} #${t.id} <b>${escapeHtml(t.title)}</b> — ${escapeHtml(t.client.name)}${due}${people}`;
}

export function taskBlock(t: TaskResponseDto): string {
  const lines = [
    `<b>#${t.id} ${escapeHtml(t.title)}</b>`,
    `Cliente: ${escapeHtml(t.client.name)}`,
    `Estado: ${STATUS_EMOJI[t.status] ?? ''} ${t.status}`,
  ];
  if (t.dueDate) lines.push(`Entrega: ${t.dueDate.slice(0, 10)}`);
  if (t.assignees.length) {
    lines.push(
      `Asignado a: ${escapeHtml(t.assignees.map((a) => a.name).join(', '))}`,
    );
  }
  for (const link of t.links) {
    lines.push(
      `🔗 <a href="${escapeHtml(link.url)}">${escapeHtml(link.label ?? link.url)}</a>`,
    );
  }
  return lines.join('\n');
}

/** Listado de clientes activos (misma salida que /clientes). */
export function formatActiveClients(clients: ClientResponseDto[]): string {
  if (clients.length === 0) {
    return 'No hay clientes activos.';
  }
  const lines = clients.map((c) => {
    const plan = c.plan ? ` — ${escapeHtml(c.plan.name)}` : '';
    return `#${c.id} <b>${escapeHtml(c.name)}</b>${plan} (${c.openTaskCount} pendientes abiertos)`;
  });
  return `<b>Clientes activos</b>\n${lines.join('\n')}`;
}

/** Listado del equipo (misma salida que /personas). */
export function formatTeam(members: TeamMemberResponseDto[]): string {
  if (members.length === 0) {
    return 'No hay personas registradas.';
  }
  const lines = members.map((m) => {
    const alerta = m.telegramLinked ? '🔔' : '🔕';
    const estado = m.active ? '' : ' (inactiva)';
    return `#${m.id} <b>${escapeHtml(m.name)}</b> ${alerta}${estado} — ${m.activeTaskCount} pendientes activos`;
  });
  return `<b>Equipo</b>\n${lines.join('\n')}`;
}

/** Listado de pendientes abiertos (misma salida que /pendientes). */
export function formatOpenTasks(
  title: string,
  tasks: TaskResponseDto[],
): string {
  if (tasks.length === 0) {
    return `${title}: no hay pendientes. 🎉`;
  }
  return `<b>${title}</b>\n${tasks.map((t) => taskLine(t)).join('\n')}`;
}

/** Lista en lenguaje natural: "Ana", "Ana y Luis", "Ana, Luis y Marta". */
export function humanList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

export function httpMessage(err: HttpException): string {
  const res = err.getResponse();
  if (typeof res === 'string') return res;
  const message = (res as { message?: string | string[] }).message;
  if (Array.isArray(message)) return message.join('\n');
  return message ?? err.message;
}

/** Valida YYYY-MM-DD y devuelve ISO a mediodía UTC (mismo criterio que /asignar). */
export function parseDateToIso(raw: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new UsageError(
      `"${raw}" no es una fecha válida. Usa el formato YYYY-MM-DD (ej: 2026-06-20).`,
    );
  }
  const date = new Date(`${raw}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new UsageError(`"${raw}" no es una fecha válida.`);
  }
  return date.toISOString();
}

export async function replyHtml(ctx: Context, html: string): Promise<void> {
  await ctx.reply(html, {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  });
}

/** Manejo uniforme de errores de comandos y mensajes (UsageError, HTTP, inesperados). */
export async function handleTelegramError(
  ctx: Context,
  err: unknown,
  logger: Logger,
  what: string,
): Promise<void> {
  if (err instanceof UsageError) {
    await ctx.reply(`⚠️ ${err.message}`);
    return;
  }
  if (err instanceof HttpException) {
    await ctx.reply(`⚠️ ${httpMessage(err)}`);
    return;
  }
  logger.error(
    `Error en ${what} de Telegram: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
  );
  await ctx.reply(`⚠️ Ocurrió un error inesperado al procesar ${what}.`);
}
