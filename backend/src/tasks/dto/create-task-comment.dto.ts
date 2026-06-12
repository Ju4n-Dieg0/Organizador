import { IsNotEmpty, IsString } from 'class-validator';

export class CreateTaskCommentDto {
  @IsString({ message: 'El comentario debe ser un texto' })
  @IsNotEmpty({ message: 'El comentario es obligatorio' })
  text: string;
}
