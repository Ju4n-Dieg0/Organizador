import { PlanResponseDto } from './dto/plan-response.dto';
import { PlanWithCount } from './plans.repository';

export class PlansMapper {
  static toResponse(plan: PlanWithCount): PlanResponseDto {
    return {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      clientCount: plan._count.clients,
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt.toISOString(),
    };
  }
}
