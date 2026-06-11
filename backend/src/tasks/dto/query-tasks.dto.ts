import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { TASK_STATUSES, TaskStatus } from './task-response.dto';

export class QueryTasksDto {
  @IsOptional()
  @IsIn(TASK_STATUSES, {
    message: `El estado debe ser uno de: ${TASK_STATUSES.join(', ')}`,
  })
  status?: TaskStatus;

  @IsOptional()
  @IsInt({ message: 'clientId debe ser un número entero' })
  clientId?: number;

  @IsOptional()
  @IsInt({ message: 'memberId debe ser un número entero' })
  memberId?: number;

  @IsOptional()
  @IsString()
  search?: string;
}
