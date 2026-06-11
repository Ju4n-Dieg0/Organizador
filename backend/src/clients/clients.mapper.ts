import { ClientWithRelations } from './clients.repository';
import { ClientResponseDto } from './dto/client-response.dto';

export class ClientsMapper {
  static toResponse(client: ClientWithRelations): ClientResponseDto {
    return {
      id: client.id,
      name: client.name,
      active: client.active,
      plan: client.plan ? { id: client.plan.id, name: client.plan.name } : null,
      driveLinks: client.driveLinks.map((l) => ({
        id: l.id,
        url: l.url,
        label: l.label,
      })),
      openTaskCount: client._count.tasks,
      createdAt: client.createdAt.toISOString(),
      updatedAt: client.updatedAt.toISOString(),
    };
  }
}
