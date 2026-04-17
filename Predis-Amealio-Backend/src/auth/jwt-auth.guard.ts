import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import axios from 'axios';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private isUuid(value: unknown): boolean {
    const v = String(value || '').trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
  }

  private get upstreamBaseUrl(): string {
    const raw =
      process.env.AMEALIO_AUTH_BASE_URL ||
      process.env.AMEALIO_BASE_URL ||
      'https://stage-be.amealio.com';
    return String(raw).trim().replace(/\/+$/, '');
  }

  private extractBearerToken(req: any): string | null {
    const auth = String(req?.headers?.authorization || '').trim();
    if (!auth) return null;
    const m = auth.match(/^Bearer\s+(.+)$/i);
    return (m?.[1] || '').trim() || null;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const token = this.extractBearerToken(req);
    if (!token) throw new UnauthorizedException('Missing Authorization token');

    // 1) Accept Predis-issued JWTs (email/password / oauth callbacks)
    const localSecret = String(process.env.JWT_SECRET || '').trim();
    if (localSecret) {
      try {
        const payload: any = jwt.verify(token, localSecret);
        req.user = {
          userId: payload?.sub || payload?.userId || payload?.id,
          email: payload?.email,
          role: payload?.role,
          user: payload,
          source: 'local',
        };
        if (!req.user.userId) throw new Error('Missing sub');
        if (!this.isUuid(req.user.userId)) {
          throw new UnauthorizedException('Invalid token');
        }
        return true;
      } catch {
        // fall through to upstream validation
      }
    }

    // 2) Accept Amealio-issued tokens by introspecting upstream
    try {
      const res = await axios.get(`${this.upstreamBaseUrl}/validate-token`, {
        headers: { authorization: `Bearer ${token}` },
        timeout: 15000,
      });
      const upstreamUser = (res.data as any)?.user ?? (res.data as any);
      const userId =
        upstreamUser?.userId ||
        upstreamUser?.id ||
        upstreamUser?._id ||
        upstreamUser?.sub;
      if (!userId) throw new UnauthorizedException('Invalid token');
      req.user = {
        userId: String(userId),
        email: upstreamUser?.email,
        role: upstreamUser?.role || 'merchant',
        user: upstreamUser,
        source: 'upstream',
      };
      if (!this.isUuid(req.user.userId)) {
        // Prevent DB UUID crashes; upstream IDs are not valid for Predis tables.
        throw new UnauthorizedException('Invalid token');
      }
      return true;
    } catch (e: any) {
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        e?.message ||
        'Unauthorized';
      throw new UnauthorizedException(msg);
    }
  }
}
