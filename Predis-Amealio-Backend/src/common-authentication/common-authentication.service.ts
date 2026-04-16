import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import * as jwt from 'jsonwebtoken';
import { UserServiceCreateDto } from './dto/user-service.dto';
import { OtpAuthenticationRequestDto } from './dto/otp-authentication.dto';

@Injectable()
export class CommonAuthenticationService {
  constructor(private configService: ConfigService) {}

  private withTimeout(timeoutMs: number) {
    // Axios `timeout` is not always enough to abort hung connections; enforce AbortSignal too.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return {
      signal: controller.signal,
      clear: () => clearTimeout(timer),
    };
  }

  private get baseUrl(): string {
    const raw =
      this.configService.get<string>('AMEALIO_AUTH_BASE_URL') ||
      this.configService.get<string>('AMEALIO_BASE_URL') ||
      'https://stage-be.amealio.com';
    return String(raw).trim().replace(/\/+$/, '');
  }

  private handleAxiosError(error: unknown): never {
    const e = error as AxiosError<any>;
    const msg = String((e as any)?.message || '');
    const code = String((e as any)?.code || '');
    if (code === 'ECONNABORTED' || /timeout/i.test(msg) || /aborted/i.test(msg)) {
      throw new HttpException({ message: 'Upstream timeout' }, 504);
    }
    if (e?.response) {
      throw new HttpException(e.response.data ?? { message: 'Upstream error' }, e.response.status);
    }
    throw new HttpException({ message: e?.message || 'Upstream request failed' }, 502);
  }

  async createUser(dto: UserServiceCreateDto) {
    const t = this.withTimeout(15000);
    try {
      const res = await axios.post(`${this.baseUrl}/user-service`, dto, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
        signal: t.signal,
      });
      return res.data;
    } catch (e) {
      this.handleAxiosError(e);
    } finally {
      t.clear();
    }
  }

  async requestOtpForMobile(dto: OtpAuthenticationRequestDto, mode: 'register' | 'login') {
    const t = this.withTimeout(15000);
    try {
      const method = mode === 'login' ? 'patch' : 'post';
      const res = await axios.request({
        url: `${this.baseUrl}/otp-authentication`,
        method,
        data: dto,
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
        signal: t.signal,
      });
      const data: any = res.data;
      // Normalize upstream field names for frontend compatibility.
      // Amealio stage may return `{ User: "<id>" }` instead of `{ user_id: "<id>" }`.
      if (data && !data.user_id && data.User) {
        data.user_id = data.User;
      }
      return data;
    } catch (e) {
      this.handleAxiosError(e);
    } finally {
      t.clear();
    }
  }

  async verifyOtp(userId: string, otp: string) {
    const t = this.withTimeout(15000);
    try {
      const res = await axios.get(`${this.baseUrl}/otp-authentication`, {
        params: { user_id: userId, OTP: otp },
        timeout: 15000,
        signal: t.signal,
      });

      const headerAuth =
        (res.headers?.authorization as string | undefined) ||
        (res.headers?.Authorization as unknown as string | undefined);
      const bodyAuth =
        (res.data?.authorization as string | undefined) ||
        (res.data?.Authorization as string | undefined);
      const bodyToken =
        (res.data?.token as string | undefined) ||
        (res.data?.accessToken as string | undefined) ||
        (res.data?.access_token as string | undefined);

      const raw = (headerAuth || bodyAuth || bodyToken || '').trim();
      const upstreamToken = raw.replace(/^Bearer\s+/i, '').trim();
      if (!upstreamToken) {
        throw new HttpException({ message: 'Upstream did not return a token' }, 502);
      }

      // Exchange upstream token for a local Predis token, so Predis APIs work without
      // depending on upstream availability on every request.
      const localSecret = String(this.configService.get<string>('JWT_SECRET') || '').trim();
      if (!localSecret) {
        // Fallback: return upstream token as-is (dev misconfig)
        return { token: upstreamToken };
      }

      // Prefer extracting user id from the upstream token payload.
      const decoded: any = jwt.decode(upstreamToken) || {};
      let sub =
        decoded?.sub ||
        decoded?.userId ||
        decoded?.id ||
        decoded?._id;

      // If not present, call upstream validate-token once.
      if (!sub) {
        const v = await axios.get(`${this.baseUrl}/validate-token`, {
          headers: { authorization: `Bearer ${upstreamToken}` },
          timeout: 15000,
          signal: t.signal,
        });
        const upstreamUser = (v.data as any)?.user ?? (v.data as any);
        sub = upstreamUser?.userId || upstreamUser?.id || upstreamUser?._id || upstreamUser?.sub;
      }

      if (!sub) {
        return { token: upstreamToken };
      }

      const localToken = jwt.sign(
        {
          sub: String(sub),
          userId: String(sub),
          email: decoded?.email,
          role: decoded?.role || 'merchant',
          upstream: true,
        },
        localSecret,
        { expiresIn: String(this.configService.get<string>('JWT_EXPIRATION') || '7d') },
      );

      return { token: localToken, upstreamToken };
    } catch (e) {
      this.handleAxiosError(e);
    } finally {
      t.clear();
    }
  }

  async validateToken(authorizationHeader: string) {
    const t = this.withTimeout(15000);
    try {
      const res = await axios.get(`${this.baseUrl}/validate-token`, {
        headers: { authorization: authorizationHeader },
        timeout: 15000,
        signal: t.signal,
      });
      return res.data;
    } catch (e) {
      this.handleAxiosError(e);
    } finally {
      t.clear();
    }
  }
}

