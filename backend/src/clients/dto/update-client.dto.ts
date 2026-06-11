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

export class UpdateClientDto {
  @IsOptional()
  @IsString({ message: 'El nombre debe ser un texto' })
  @IsNotEmpty({ message: 'El nombre no puede estar vacío' })
  name?: string;

  // null = quitar el plan
  @IsOptional()
  @IsInt({ message: 'El planId debe ser un número entero' })
  planId?: number | null;

  // si viene, reemplaza la lista completa
  @IsOptional()
  @IsArray({ message: 'driveLinks debe ser una lista' })
  @ValidateNested({ each: true })
  @Type(() => DriveLinkDto)
  driveLinks?: DriveLinkDto[];
}
