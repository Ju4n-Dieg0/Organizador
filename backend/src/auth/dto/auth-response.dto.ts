export class AuthUserDto {
  id: number;
  email: string;
  name: string;
}

export class LoginResponseDto {
  accessToken: string;
  user: AuthUserDto;
}
