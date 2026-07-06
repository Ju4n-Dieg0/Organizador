import { IsBoolean } from 'class-validator';

export class SetOwnerDto {
  @IsBoolean()
  isOwner: boolean;
}
