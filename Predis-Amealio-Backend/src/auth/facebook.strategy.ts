import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-facebook';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, 'facebook') {
  constructor(configService: ConfigService) {
    const clientID = configService.get('FACEBOOK_APP_ID');
    const clientSecret = configService.get('FACEBOOK_APP_SECRET');
    if (!clientID) {
      throw new Error('FACEBOOK_APP_ID is not configured');
    }
    if (!clientSecret) {
      throw new Error('FACEBOOK_APP_SECRET is not configured');
    }
    super({
      clientID,
      clientSecret,
      callbackURL: `${configService.get('BACKEND_URL') || 'http://localhost:8001'}/api/auth/facebook/callback`,
      scope: ['email', 'public_profile'],
      profileFields: ['id', 'emails', 'name', 'photos'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: (err: any, user: any, info?: any) => void,
  ): Promise<any> {
    const { name, emails, id, photos } = profile;
    const user = {
      facebookId: id,
      email: emails && emails.length > 0 ? emails[0].value : null,
      fullName: `${name?.givenName || ''} ${name?.familyName || ''}`.trim(),
      profileImage: photos && photos.length > 0 ? photos[0].value : null,
      accessToken,
    };
    done(null, user);
  }
}
