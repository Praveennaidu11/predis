import { Injectable, ExecutionContext, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class FacebookAuthGuard extends AuthGuard('facebook') {
  constructor(private configService: ConfigService) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const clientID = this.configService.get('FACEBOOK_APP_ID');
    const clientSecret = this.configService.get('FACEBOOK_APP_SECRET');
    if (!clientID || !clientSecret) {
      throw new ServiceUnavailableException(
        'Facebook OAuth is not configured. Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET in backend .env',
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
