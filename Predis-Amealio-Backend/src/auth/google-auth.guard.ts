import { Injectable, ExecutionContext, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private configService: ConfigService) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const clientID = this.configService.get('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get('GOOGLE_CLIENT_SECRET');
    if (
      !clientID ||
      !clientSecret ||
      clientID === 'your_google_client_id' ||
      clientSecret === 'your_google_client_secret'
    ) {
      throw new ServiceUnavailableException(
        'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend .env',
      );
    }
    return super.canActivate(context) as any;
  }

  getAuthenticateOptions(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const { role } = request.query;
    return {
      state: JSON.stringify({ role: role || 'merchant' }),
    };
  }
}

