import { Injectable, NotFoundException } from '@nestjs/common';
import { PlansService } from '../plans/plans.service';
import { ClientsMapper } from './clients.mapper';
import { ClientsRepository } from './clients.repository';
import { ClientResponseDto } from './dto/client-response.dto';
import { CreateClientDto } from './dto/create-client.dto';
import { QueryClientsDto } from './dto/query-clients.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Injectable()
export class ClientsService {
  constructor(
    private readonly clientsRepository: ClientsRepository,
    private readonly plansService: PlansService,
  ) {}

  async create(dto: CreateClientDto): Promise<ClientResponseDto> {
    if (dto.planId != null) {
      await this.plansService.findOne(dto.planId); // 404 si no existe
    }
    const client = await this.clientsRepository.create({
      name: dto.name,
      planId: dto.planId,
      driveLinks: dto.driveLinks,
    });
    return ClientsMapper.toResponse(client);
  }

  async findAll(query: QueryClientsDto): Promise<ClientResponseDto[]> {
    const clients = await this.clientsRepository.findAll({
      status: query.status ?? 'all',
      search: query.search,
    });
    return clients.map((c) => ClientsMapper.toResponse(c));
  }

  async findOne(id: number): Promise<ClientResponseDto> {
    const client = await this.clientsRepository.findById(id);
    if (!client) {
      throw new NotFoundException(`Cliente #${id} no encontrado`);
    }
    return ClientsMapper.toResponse(client);
  }

  async update(id: number, dto: UpdateClientDto): Promise<ClientResponseDto> {
    await this.findOne(id);
    if (dto.planId != null) {
      await this.plansService.findOne(dto.planId);
    }
    const client = await this.clientsRepository.update(id, {
      name: dto.name,
      planId: dto.planId,
      driveLinks: dto.driveLinks,
    });
    return ClientsMapper.toResponse(client);
  }

  async deactivate(id: number): Promise<ClientResponseDto> {
    await this.findOne(id);
    const client = await this.clientsRepository.setActive(id, false);
    return ClientsMapper.toResponse(client);
  }

  async activate(id: number): Promise<ClientResponseDto> {
    await this.findOne(id);
    const client = await this.clientsRepository.setActive(id, true);
    return ClientsMapper.toResponse(client);
  }
}
