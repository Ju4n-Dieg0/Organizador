import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { DriveLinkDto } from './drive-link.dto';

export class CreateClientDto {
  @IsString({ message: 'El nombre debe ser un texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  name: string;

  @IsOptional()
  @IsInt({ message: 'El planId debe ser un número entero' })
  planId?: number;

  @IsOptional()
  @IsArray({ message: 'driveLinks debe ser una lista' })
  @ValidateNested({ each: true })
  @Type(() => DriveLinkDto)
  driveLinks?: DriveLinkDto[];
}
