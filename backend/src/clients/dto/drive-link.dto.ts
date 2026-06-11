import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class DriveLinkDto {
  @IsString({ message: 'La URL debe ser un texto' })
  @IsNotEmpty({ message: 'La URL es obligatoria' })
  @IsUrl({}, { message: 'La URL del link no es válida' })
  url: string;

  @IsOptional()
  @IsString({ message: 'La etiqueta debe ser un texto' })
  label?: string;
}
