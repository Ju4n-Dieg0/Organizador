import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
} from 'class-validator';

export class ReassignTaskDto {
  @IsArray({ message: 'memberIds debe ser una lista' })
  @ArrayMinSize(1, { message: 'Debes asignar al menos una persona' })
  @IsInt({ each: true, message: 'Cada memberId debe ser un número entero' })
  memberIds: number[];

  @IsString({ message: 'La razón debe ser un texto' })
  @IsNotEmpty({ message: 'La razón es obligatoria para reasignar' })
  reason: string;
}
