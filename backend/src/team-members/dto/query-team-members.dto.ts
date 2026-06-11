import { IsIn, IsOptional } from 'class-validator';

export class QueryTeamMembersDto {
  @IsOptional()
  @IsIn(['active', 'inactive', 'all'], {
    message: 'status debe ser active, inactive o all',
  })
  status?: 'active' | 'inactive' | 'all';
}
