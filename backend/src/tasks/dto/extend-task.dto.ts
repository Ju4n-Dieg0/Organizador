import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

export class ExtendTaskDto {
  @IsDateString(
    {},
    { message: 'La nueva fecha de entrega debe ser una fecha válida (ISO)' },
  )
  newDueDate: string;

  @IsString({ message: 'La razón debe ser un texto' })
  @IsNotEmpty({ message: 'La razón es obligatoria para extender' })
  reason: string;
}
