import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(configService: ConfigService) {
    const clientID = configService.get('GOOGLE_CLIENT_ID');
    const clientSecret = configService.get('GOOGLE_CLIENT_SECRET');
    super({
      // Keep the app bootable even when creds missing.
      // The guard will block these routes with a helpful error message.
      clientID: clientID || 'MISSING_GOOGLE_CLIENT_ID',
      clientSecret: clientSecret || 'MISSING_GOOGLE_CLIENT_SECRET',
      callbackURL: `${
        configService.get('BACKEND_URL') || 'http://localhost:8001'
      }/api/auth/google/callback`,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: (err: any, user: any, info?: any) => void,
  ): Promise<any> {
    const email =
      profile.emails && profile.emails.length > 0 ? profile.emails[0].value : null;
    const fullName =
      profile.displayName ||
      `${profile.name?.givenName || ''} ${profile.name?.familyName || ''}`.trim();
    const profileImage =
      profile.photos && profile.photos.length > 0 ? profile.photos[0].value : null;

    done(null, {
      googleId: profile.id,
      email,
      fullName,
      profileImage,
      accessToken,
    });
  }
}

