import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

const extractJwt = ExtractJwt.fromExtractors([
  ExtractJwt.fromAuthHeaderAsBearerToken(),
  (req: any) => {
    const v = req?.headers?.authorization;
    if (!v) return null;
    const s = String(v).trim();
    if (!s) return null;
    return /^bearer\s+/i.test(s) ? null : s;
  },
]);

@Injectable()
export class CommonJwtStrategy extends PassportStrategy(Strategy, 'common-jwt') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: extractJwt,
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    return payload;
  }
}

