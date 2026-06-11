import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { TASK_STATUSES, TaskStatus } from './task-response.dto';

export class ChangeStatusDto {
  @IsIn(TASK_STATUSES, {
    message: `El estado debe ser uno de: ${TASK_STATUSES.join(', ')}`,
  })
  status: TaskStatus;

  @IsOptional()
  @IsString({ message: 'La razón debe ser un texto' })
  @IsNotEmpty({ message: 'La razón no puede estar vacía' })
  reason?: string;
}
