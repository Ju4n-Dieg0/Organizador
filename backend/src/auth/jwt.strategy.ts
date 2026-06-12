import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface JwtPayload {
  sub: number;
  email: string;
  name?: string;
}

export interface RequestUser {
  userId: number;
  email: string;
  name: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'change-me',
    });
  }

  validate(payload: JwtPayload): RequestUser {
    // Tokens emitidos antes de incluir `name` siguen siendo válidos.
    return {
      userId: payload.sub,
      email: payload.email,
      name: payload.name ?? payload.email,
    };
  }
}
