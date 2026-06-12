import { Injectable } from '@nestjs/common';
import { Context } from 'telegraf';
import { ClientResponseDto } from '../clients/dto/client-response.dto';
import { ClientsService } from '../clients/clients.service';
import { TeamMemberResponseDto } from '../team-members/dto/team-member-response.dto';
import { TeamMembersService } from '../team-members/team-members.service';
import { escapeHtml, replyHtml, UsageError } from './telegram-format';

/**
 * Resultado de resolver un nombre contra las entidades activas.
 * - `match`: única coincidencia confiable, se puede usar directo.
 * - `suggestion`: parecido razonable (typo), hay que confirmar con el usuario.
 * - `ambiguous`: varios candidatos igual de buenos, hay que preguntar cuál.
 * - `none`: sin candidatos.
 */
export type NameResolution<T> =
  | { kind: 'match'; entity: T }
  | { kind: 'suggestion'; entity: T }
  | { kind: 'ambiguous'; options: T[] }
  | { kind: 'none' };

/** NFD + sin diacríticos, lowercase, trim y espacios colapsados. */
export function normalizeName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/** Distancia de Levenshtein clásica (dos filas, sin dependencias). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = new Array<number>(n + 1);
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = curr;
  }
  return prev[n];
}

/**
 * Mejor distancia del query contra el nombre completo o cualquiera de sus
 * palabras, con umbral ≤ 2 (≤ 1 si el candidato tiene ≤ 5 caracteres).
 * Devuelve null si ningún candidato queda dentro del umbral.
 */
function fuzzyDistance(query: string, normalizedName: string): number | null {
  const candidates = [normalizedName, ...normalizedName.split(' ')];
  let best: number | null = null;
  for (const candidate of candidates) {
    if (!candidate) continue;
    const limit = candidate.length <= 5 ? 1 : 2;
    const distance = levenshtein(query, candidate);
    if (distance <= limit && (best === null || distance < best)) {
      best = distance;
    }
  }
  return best;
}

/**
 * Matching por nombre en tres niveles: exacto normalizado → substring en
 * cualquier dirección → Levenshtein acotado (sugerencia). Puro y síncrono.
 */
export function matchByName<T extends { name: string }>(
  query: string,
  entities: T[],
): NameResolution<T> {
  const q = normalizeName(query);
  if (!q) return { kind: 'none' };
  const indexed = entities.map((entity) => ({
    entity,
    norm: normalizeName(entity.name),
  }));

  const exact = indexed.filter((x) => x.norm === q);
  if (exact.length === 1) return { kind: 'match', entity: exact[0].entity };
  if (exact.length > 1) {
    return { kind: 'ambiguous', options: exact.map((x) => x.entity) };
  }

  const partial = indexed.filter(
    (x) => x.norm.includes(q) || q.includes(x.norm),
  );
  if (partial.length === 1) return { kind: 'match', entity: partial[0].entity };
  if (partial.length > 1) {
    return { kind: 'ambiguous', options: partial.map((x) => x.entity) };
  }

  const fuzzy: { entity: T; distance: number }[] = [];
  for (const { entity, norm } of indexed) {
    const distance = fuzzyDistance(q, norm);
    if (distance !== null) fuzzy.push({ entity, distance });
  }
  if (fuzzy.length === 0) return { kind: 'none' };
  const min = Math.min(...fuzzy.map((f) => f.distance));
  const top = fuzzy.filter((f) => f.distance === min);
  if (top.length === 1) return { kind: 'suggestion', entity: top[0].entity };
  return { kind: 'ambiguous', options: top.map((f) => f.entity) };
}

/**
 * Resolución de nombres → entidades para el bot. Expone:
 * - `findClient`/`findMember`: métodos PUROS (sin ctx) que devuelven una
 *   `NameResolution` para que el modo conversacional decida cómo preguntar.
 * - `resolveClient`/`resolveMembers`: envoltorios para los comandos slash,
 *   que responden por Telegram ante ambigüedad/sugerencia y devuelven null.
 */
@Injectable()
export class TelegramResolverService {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly teamMembersService: TeamMembersService,
  ) {}

  /** Resolución fuzzy de un cliente ACTIVO por nombre. Puro: no responde. */
  async findClient(name: string): Promise<NameResolution<ClientResponseDto>> {
    const clients = await this.clientsService.findAll({ status: 'active' });
    return matchByName(name, clients);
  }

  /** Resolución fuzzy de una persona ACTIVA por nombre. Puro: no responde. */
  async findMember(
    name: string,
  ): Promise<NameResolution<TeamMemberResponseDto>> {
    const members = await this.teamMembersService.findAll({
      status: 'active',
    });
    return matchByName(name, members);
  }

  /** Resuelve un cliente activo para los comandos slash (UX con respuestas). */
  async resolveClient(
    ctx: Context,
    name: string,
  ): Promise<ClientResponseDto | null> {
    const res = await this.findClient(name);
    switch (res.kind) {
      case 'match':
        return res.entity;
      case 'suggestion':
        await replyHtml(
          ctx,
          `No encontré un cliente "${escapeHtml(name)}" tal cual. ¿Te referías a "${escapeHtml(res.entity.name)}"? Reintenta el comando con ese nombre.`,
        );
        return null;
      case 'ambiguous': {
        const options = res.options
          .map((c) => `#${c.id} ${escapeHtml(c.name)}`)
          .join('\n');
        await replyHtml(
          ctx,
          `Hay varios clientes que coinciden con "${escapeHtml(name)}". Sé más específico:\n${options}`,
        );
        return null;
      }
      case 'none':
        await replyHtml(
          ctx,
          `No encontré ningún cliente activo que coincida con "${escapeHtml(name)}". Usa /clientes para ver la lista.`,
        );
        return null;
    }
  }

  /** Resuelve personas activas para los comandos slash (UX con respuestas). */
  async resolveMembers(
    ctx: Context,
    names: string[],
  ): Promise<TeamMemberResponseDto[] | null> {
    const cleaned = names.map((n) => n.trim()).filter(Boolean);
    if (cleaned.length === 0) {
      throw new UsageError('Debes indicar al menos una persona.');
    }
    const resolved: TeamMemberResponseDto[] = [];
    for (const name of cleaned) {
      const res = await this.findMember(name);
      switch (res.kind) {
        case 'match':
          resolved.push(res.entity);
          break;
        case 'suggestion':
          await replyHtml(
            ctx,
            `No encontré una persona "${escapeHtml(name)}" tal cual. ¿Te referías a "${escapeHtml(res.entity.name)}"? Reintenta el comando con ese nombre.`,
          );
          return null;
        case 'ambiguous': {
          const options = res.options
            .map((m) => `#${m.id} ${escapeHtml(m.name)}`)
            .join('\n');
          await replyHtml(
            ctx,
            `Hay varias personas que coinciden con "${escapeHtml(name)}". Sé más específico:\n${options}`,
          );
          return null;
        }
        case 'none':
          await replyHtml(
            ctx,
            `No encontré ninguna persona activa que coincida con "${escapeHtml(name)}". Usa /personas para ver la lista.`,
          );
          return null;
      }
    }
    return resolved.filter(
      (m, i) => resolved.findIndex((x) => x.id === m.id) === i,
    );
  }
}
