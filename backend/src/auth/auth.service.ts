import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthRepository } from './auth.repository';
import { AuthUserDto, LoginResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.authRepository.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordOk = await bcrypt.compare(dto.password, user.password);
    if (!passwordOk) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      name: user.name,
    });

    return {
      accessToken,
      user: { id: user.id, email: user.email, name: user.name },
    };
  }

  async me(userId: number): Promise<AuthUserDto> {
    const user = await this.authRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }
    return { id: user.id, email: user.email, name: user.name };
  }
}
