import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { RequestUser } from '../auth/jwt.strategy';
import { QueryRequestsDto } from './dto/query-requests.dto';
import { RejectRequestDto } from './dto/reject-request.dto';
import { TeamRequestResponseDto } from './dto/team-request-response.dto';
import { RequestsService } from './requests.service';

@Controller('requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Get()
  findAll(@Query() query: QueryRequestsDto): Promise<TeamRequestResponseDto[]> {
    return this.requestsService.findAll(query);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<TeamRequestResponseDto> {
    return this.requestsService.findOne(id);
  }

  @Post(':id/approve')
  approve(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user: RequestUser },
  ): Promise<TeamRequestResponseDto> {
    return this.requestsService.approve(id, `${req.user.name} (web)`);
  }

  @Post(':id/reject')
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectRequestDto,
    @Req() req: { user: RequestUser },
  ): Promise<TeamRequestResponseDto> {
    return this.requestsService.reject(id, dto.reason, `${req.user.name} (web)`);
  }
}
