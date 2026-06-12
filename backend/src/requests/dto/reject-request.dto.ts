import { IsNotEmpty, IsString } from 'class-validator';

export class RejectRequestDto {
  @IsString({ message: 'La razón debe ser un texto' })
  @IsNotEmpty({ message: 'La razón es obligatoria para rechazar' })
  reason: string;
}
