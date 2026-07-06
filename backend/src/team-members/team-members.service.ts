import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { BotInfoService } from '../telegram-info/bot-info.service';
import { CreateTeamMemberDto } from './dto/create-team-member.dto';
import { QueryTeamMembersDto } from './dto/query-team-members.dto';
import { TeamMemberResponseDto } from './dto/team-member-response.dto';
import { TelegramLinkResponseDto } from './dto/telegram-link-response.dto';
import { UpdateTeamMemberDto } from './dto/update-team-member.dto';
import { TeamMembersMapper } from './team-members.mapper';
import { TeamMembersRepository } from './team-members.repository';

/** Vigencia del token de vinculación: 48 horas. */
const LINK_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

export type RedeemTelegramLinkResult =
  | { kind: 'invalid' }
  | { kind: 'expired' }
  | { kind: 'linked'; memberName: string; relinkedFrom: string | null };

/** Vista interna (notifications): NUNCA sale por el controller. */
export interface TeamMemberInternal {
  id: number;
  name: string;
  active: boolean;
  telegramChatId: string | null;
  isOwner: boolean;
}

@Injectable()
export class TeamMembersService {
  constructor(
    private readonly teamMembersRepository: TeamMembersRepository,
    private readonly botInfoService: BotInfoService,
  ) {}

  async create(dto: CreateTeamMemberDto): Promise<TeamMemberResponseDto> {
    const member = await this.teamMembersRepository.create({
      name: dto.name,
    });
    return TeamMembersMapper.toResponse(member);
  }

  async findAll(query: QueryTeamMembersDto): Promise<TeamMemberResponseDto[]> {
    const members = await this.teamMembersRepository.findAll(
      query.status ?? 'all',
    );
    return members.map((m) => TeamMembersMapper.toResponse(m));
  }

  /**
   * Vista interna con telegramChatId para NotificationsService.
   * NO se expone en el controller.
   */
  async findAllInternal(): Promise<TeamMemberInternal[]> {
    const members = await this.teamMembersRepository.findAll('all');
    return members.map((m) => ({
      id: m.id,
      name: m.name,
      active: m.active,
      telegramChatId: m.telegramChatId,
      isOwner: m.isOwner,
    }));
  }

  async findOne(id: number): Promise<TeamMemberResponseDto> {
    const member = await this.teamMembersRepository.findById(id);
    if (!member) {
      throw new NotFoundException(`Persona #${id} no encontrada`);
    }
    return TeamMembersMapper.toResponse(member);
  }

  async update(
    id: number,
    dto: UpdateTeamMemberDto,
  ): Promise<TeamMemberResponseDto> {
    await this.findOne(id);
    const member = await this.teamMembersRepository.update(id, {
      name: dto.name,
    });
    return TeamMembersMapper.toResponse(member);
  }

  async deactivate(id: number): Promise<TeamMemberResponseDto> {
    await this.findOne(id);
    const member = await this.teamMembersRepository.setActive(id, false);
    return TeamMembersMapper.toResponse(member);
  }

  async activate(id: number): Promise<TeamMemberResponseDto> {
    await this.findOne(id);
    const member = await this.teamMembersRepository.setActive(id, true);
    return TeamMembersMapper.toResponse(member);
  }

  /**
   * Marca/desmarca este miembro como el dueño. Solo puede haber UNO en true:
   * al marcar, el repository desmarca al anterior en la misma transacción.
   */
  async setOwner(id: number, isOwner: boolean): Promise<TeamMemberResponseDto> {
    await this.findOne(id);
    const member = await this.teamMembersRepository.setOwner(id, isOwner);
    return TeamMembersMapper.toResponse(member);
  }

  /**
   * Genera (o regenera, invalidando el anterior) el deep link de vinculación
   * de Telegram para un miembro. 503 si el bot está desactivado.
   */
  async generateTelegramLink(id: number): Promise<TelegramLinkResponseDto> {
    await this.findOne(id);
    const username = await this.botInfoService.getBotUsername();
    if (!username) {
      throw new ServiceUnavailableException(
        'El bot de Telegram no está configurado; no se pueden generar enlaces de vinculación',
      );
    }
    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + LINK_TOKEN_TTL_MS);
    await this.teamMembersRepository.upsertLinkToken(id, token, expiresAt);
    return {
      link: `https://t.me/${username}?start=${token}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /** Desvincula: borra el telegramChatId y el token pendiente si lo hay. */
  async unlinkTelegram(id: number): Promise<void> {
    await this.findOne(id);
    await this.teamMembersRepository.setTelegramChatId(id, null);
    await this.teamMembersRepository.deleteLinkToken(id);
  }

  /**
   * Canjea un token de /start <token> (lo consume el bot de Telegram).
   * Un solo uso: el token se borra al canjearse o al detectarse vencido.
   * Si el chat ya estaba vinculado a OTRO miembro, se re-vincula y se
   * devuelve su nombre en `relinkedFrom`.
   */
  async redeemTelegramLinkToken(
    token: string,
    chatId: string,
  ): Promise<RedeemTelegramLinkResult> {
    const linkToken =
      await this.teamMembersRepository.findLinkTokenByToken(token);
    if (!linkToken) {
      return { kind: 'invalid' };
    }
    if (linkToken.expiresAt <= new Date()) {
      await this.teamMembersRepository.deleteLinkTokenByToken(token);
      return { kind: 'expired' };
    }
    const previous =
      await this.teamMembersRepository.findByTelegramChatId(chatId);
    const relinkedFrom =
      previous && previous.id !== linkToken.memberId ? previous.name : null;
    await this.teamMembersRepository.redeemLinkToken(
      linkToken.id,
      linkToken.memberId,
      chatId,
    );
    return { kind: 'linked', memberName: linkToken.member.name, relinkedFrom };
  }
}
