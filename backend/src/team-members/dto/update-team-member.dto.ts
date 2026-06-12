import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateTeamMemberDto {
  @IsOptional()
  @IsString({ message: 'El nombre debe ser un texto' })
  @IsNotEmpty({ message: 'El nombre no puede estar vacío' })
  name?: string;
}
