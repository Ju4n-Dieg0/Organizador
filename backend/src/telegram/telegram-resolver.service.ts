import { Injectable } from '@nestjs/common';
import { Context } from 'telegraf';
import { ClientResponseDto } from '../clients/dto/client-response.dto';
import { ClientsService } from '../clients/clients.service';
import { TeamMemberResponseDto } from '../team-members/dto/team-member-response.dto';
import { TeamMembersService } from '../team-members/team-members.service';
import { escapeHtml, replyHtml, UsageError } from './telegram-format';

/**
 * Resolución de nombres → entidades para el bot (comandos y texto libre).
 * Coincidencia parcial case-insensitive; ante ambigüedad responde las
 * opciones con sus IDs y devuelve null (el caller no debe ejecutar nada).
 */
@Injectable()
export class TelegramResolverService {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly teamMembersService: TeamMembersService,
  ) {}

  /** Resuelve un cliente activo por nombre parcial (case-insensitive). */
  async resolveClient(
    ctx: Context,
    name: string,
  ): Promise<ClientResponseDto | null> {
    const matches = await this.clientsService.findAll({
      status: 'active',
      search: name,
    });
    if (matches.length === 0) {
      await replyHtml(
        ctx,
        `No encontré ningún cliente activo que coincida con "${escapeHtml(name)}". Usa /clientes para ver la lista.`,
      );
      return null;
    }
    if (matches.length > 1) {
      const exact = matches.find(
        (c) => c.name.toLowerCase() === name.toLowerCase(),
      );
      if (exact) return exact;
      const options = matches
        .map((c) => `#${c.id} ${escapeHtml(c.name)}`)
        .join('\n');
      await replyHtml(
        ctx,
        `Hay varios clientes que coinciden con "${escapeHtml(name)}". Sé más específico:\n${options}`,
      );
      return null;
    }
    return matches[0];
  }

  /** Resuelve personas activas por una lista de nombres parciales. */
  async resolveMembers(
    ctx: Context,
    names: string[],
  ): Promise<TeamMemberResponseDto[] | null> {
    const cleaned = names.map((n) => n.trim()).filter(Boolean);
    if (cleaned.length === 0) {
      throw new UsageError('Debes indicar al menos una persona.');
    }
    const members = await this.teamMembersService.findAll({
      status: 'active',
    });
    const resolved: TeamMemberResponseDto[] = [];
    for (const name of cleaned) {
      const lower = name.toLowerCase();
      const matches = members.filter((m) =>
        m.name.toLowerCase().includes(lower),
      );
      if (matches.length === 0) {
        await replyHtml(
          ctx,
          `No encontré ninguna persona activa que coincida con "${escapeHtml(name)}". Usa /personas para ver la lista.`,
        );
        return null;
      }
      if (matches.length > 1) {
        const exact = matches.find((m) => m.name.toLowerCase() === lower);
        if (exact) {
          resolved.push(exact);
          continue;
        }
        const options = matches
          .map((m) => `#${m.id} ${escapeHtml(m.name)}`)
          .join('\n');
        await replyHtml(
          ctx,
          `Hay varias personas que coinciden con "${escapeHtml(name)}". Sé más específico:\n${options}`,
        );
        return null;
      }
      resolved.push(matches[0]);
    }
    return resolved;
  }
}
