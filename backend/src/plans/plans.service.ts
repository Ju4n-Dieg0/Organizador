import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreatePlanDto } from './dto/create-plan.dto';
import { PlanResponseDto } from './dto/plan-response.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { PlansMapper } from './plans.mapper';
import { PlansRepository } from './plans.repository';

@Injectable()
export class PlansService {
  constructor(private readonly plansRepository: PlansRepository) {}

  async create(dto: CreatePlanDto): Promise<PlanResponseDto> {
    const existing = await this.plansRepository.findByName(dto.name);
    if (existing) {
      throw new ConflictException(`Ya existe un plan con el nombre "${dto.name}"`);
    }
    const plan = await this.plansRepository.create({
      name: dto.name,
      description: dto.description,
    });
    return PlansMapper.toResponse(plan);
  }

  async findAll(): Promise<PlanResponseDto[]> {
    const plans = await this.plansRepository.findAll();
    return plans.map((p) => PlansMapper.toResponse(p));
  }

  async findOne(id: number): Promise<PlanResponseDto> {
    const plan = await this.plansRepository.findById(id);
    if (!plan) {
      throw new NotFoundException(`Plan #${id} no encontrado`);
    }
    return PlansMapper.toResponse(plan);
  }

  async update(id: number, dto: UpdatePlanDto): Promise<PlanResponseDto> {
    const plan = await this.plansRepository.findById(id);
    if (!plan) {
      throw new NotFoundException(`Plan #${id} no encontrado`);
    }
    if (dto.name && dto.name !== plan.name) {
      const existing = await this.plansRepository.findByName(dto.name);
      if (existing) {
        throw new ConflictException(
          `Ya existe un plan con el nombre "${dto.name}"`,
        );
      }
    }
    const updated = await this.plansRepository.update(id, {
      name: dto.name,
      description: dto.description,
    });
    return PlansMapper.toResponse(updated);
  }

  async remove(id: number): Promise<void> {
    const plan = await this.plansRepository.findById(id);
    if (!plan) {
      throw new NotFoundException(`Plan #${id} no encontrado`);
    }
    if (plan._count.clients > 0) {
      throw new ConflictException(
        'No se puede eliminar el plan porque tiene clientes asociados',
      );
    }
    await this.plansRepository.delete(id);
  }
}
