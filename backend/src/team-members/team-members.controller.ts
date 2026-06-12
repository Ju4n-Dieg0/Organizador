import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CreateTeamMemberDto } from './dto/create-team-member.dto';
import { QueryTeamMembersDto } from './dto/query-team-members.dto';
import { TeamMemberResponseDto } from './dto/team-member-response.dto';
import { TelegramLinkResponseDto } from './dto/telegram-link-response.dto';
import { UpdateTeamMemberDto } from './dto/update-team-member.dto';
import { TeamMembersService } from './team-members.service';

@Controller('team-members')
export class TeamMembersController {
  constructor(private readonly teamMembersService: TeamMembersService) {}

  @Post()
  create(@Body() dto: CreateTeamMemberDto): Promise<TeamMemberResponseDto> {
    return this.teamMembersService.create(dto);
  }

  @Get()
  findAll(
    @Query() query: QueryTeamMembersDto,
  ): Promise<TeamMemberResponseDto[]> {
    return this.teamMembersService.findAll(query);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<TeamMemberResponseDto> {
    return this.teamMembersService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTeamMemberDto,
  ): Promise<TeamMemberResponseDto> {
    return this.teamMembersService.update(id, dto);
  }

  @Patch(':id/deactivate')
  deactivate(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<TeamMemberResponseDto> {
    return this.teamMembersService.deactivate(id);
  }

  @Patch(':id/activate')
  activate(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<TeamMemberResponseDto> {
    return this.teamMembersService.activate(id);
  }

  @Post(':id/telegram-link')
  generateTelegramLink(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<TelegramLinkResponseDto> {
    return this.teamMembersService.generateTelegramLink(id);
  }

  @Delete(':id/telegram-link')
  @HttpCode(204)
  unlinkTelegram(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.teamMembersService.unlinkTelegram(id);
  }
}
