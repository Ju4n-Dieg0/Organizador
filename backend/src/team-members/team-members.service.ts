import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateTeamMemberDto } from './dto/create-team-member.dto';
import { QueryTeamMembersDto } from './dto/query-team-members.dto';
import { TeamMemberResponseDto } from './dto/team-member-response.dto';
import { UpdateTeamMemberDto } from './dto/update-team-member.dto';
import { TeamMembersMapper } from './team-members.mapper';
import { TeamMembersRepository } from './team-members.repository';

@Injectable()
export class TeamMembersService {
  constructor(private readonly teamMembersRepository: TeamMembersRepository) {}

  async create(dto: CreateTeamMemberDto): Promise<TeamMemberResponseDto> {
    if (dto.telegramChatId) {
      await this.ensureChatIdFree(dto.telegramChatId);
    }
    const member = await this.teamMembersRepository.create({
      name: dto.name,
      telegramChatId: dto.telegramChatId,
    });
    return TeamMembersMapper.toResponse(member);
  }

  async findAll(query: QueryTeamMembersDto): Promise<TeamMemberResponseDto[]> {
    const members = await this.teamMembersRepository.findAll(
      query.status ?? 'all',
    );
    return members.map((m) => TeamMembersMapper.toResponse(m));
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
    if (dto.telegramChatId) {
      await this.ensureChatIdFree(dto.telegramChatId, id);
    }
    const member = await this.teamMembersRepository.update(id, {
      name: dto.name,
      telegramChatId: dto.telegramChatId,
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

  private async ensureChatIdFree(
    chatId: string,
    exceptId?: number,
  ): Promise<void> {
    const existing =
      await this.teamMembersRepository.findByTelegramChatId(chatId);
    if (existing && existing.id !== exceptId) {
      throw new ConflictException(
        `Ese chat de Telegram ya está vinculado a "${existing.name}"`,
      );
    }
  }
}
