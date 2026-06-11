import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTeamMemberDto {
  @IsString({ message: 'El nombre debe ser un texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  name: string;

  @IsOptional()
  @IsString({ message: 'El telegramChatId debe ser un texto' })
  telegramChatId?: string;
}
