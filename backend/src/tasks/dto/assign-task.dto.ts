import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
} from 'class-validator';

export class AssignTaskDto {
  @IsArray({ message: 'memberIds debe ser una lista' })
  @ArrayMinSize(1, { message: 'Debes asignar al menos una persona' })
  @IsInt({ each: true, message: 'Cada memberId debe ser un número entero' })
  memberIds: number[];

  @IsDateString(
    {},
    { message: 'La fecha de entrega debe ser una fecha válida (ISO)' },
  )
  dueDate: string;
}
