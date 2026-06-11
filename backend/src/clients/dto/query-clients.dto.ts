import { IsIn, IsOptional, IsString } from 'class-validator';

export class QueryClientsDto {
  @IsOptional()
  @IsIn(['active', 'inactive', 'all'], {
    message: 'status debe ser active, inactive o all',
  })
  status?: 'active' | 'inactive' | 'all';

  @IsOptional()
  @IsString()
  search?: string;
}
