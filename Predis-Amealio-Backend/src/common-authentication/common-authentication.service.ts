import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { AxiosError } from 'axios';
import * as jwt from 'jsonwebtoken';
import { Repository } from 'typeorm';
import { User } from '../common/entities/user.entity';
import { UserServiceCreateDto } from './dto/user-service.dto';
import { OtpAuthenticationRequestDto } from './dto/otp-authentication.dto';

@Injectable()
export class CommonAuthenticationService {
  constructor(
    private configService: ConfigService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  private normalizeEmailForOtpIdentity(input: unknown): string | null {
    const email = String(input || '').trim().toLowerCase();
    if (!email) return null;
    // Simple sanity check; we don't need strict RFC validation here.
    if (!email.includes('@') || email.startsWith('@') || email.endsWith('@')) return null;
    return email;
  }

  private normalizeMobileForOtpIdentity(input: unknown): string | null {
    const digits = String(input || '').replace(/[^\d]/g, '');
    if (!digits) return null;
    // Keep as-is; upstream can be country-specific. Avoid rejecting short numbers aggressively.
    return digits;
  }

  private buildSyntheticEmailFromMobile(mobile: string): string {
    // Email is required + unique in our DB; OTP-only users may not have email upstream.
    // Keep deterministic so repeated logins map to the same local user record.
    return `otp-${mobile}@local.otp`;
  }

  private pickUpstreamIdentity(upstreamUser: any, decoded: any) {
    const email =
      this.normalizeEmailForOtpIdentity(decoded?.email) ||
      this.normalizeEmailForOtpIdentity(upstreamUser?.email) ||
      this.normalizeEmailForOtpIdentity(upstreamUser?.user?.email);

    const mobile =
      this.normalizeMobileForOtpIdentity(upstreamUser?.mobile) ||
      this.normalizeMobileForOtpIdentity(upstreamUser?.mobile_number) ||
      this.normalizeMobileForOtpIdentity(upstreamUser?.phone) ||
      this.normalizeMobileForOtpIdentity(upstreamUser?.phoneNumber) ||
      this.normalizeMobileForOtpIdentity(upstreamUser?.user?.mobile);

    const countryCode =
      String(
        upstreamUser?.country_code ||
          upstreamUser?.countryCode ||
          upstreamUser?.user?.country_code ||
          upstreamUser?.user?.countryCode ||
          '',
      ).trim() || null;

    const fullName =
      String(upstreamUser?.fullName || upstreamUser?.name || upstreamUser?.user?.fullName || upstreamUser?.user?.name || '')
        .trim() || null;

    const role = String(decoded?.role || upstreamUser?.role || upstreamUser?.user?.role || 'merchant').trim() || 'merchant';

    return { email, mobile, countryCode, fullName, role };
  }

  private async resolveOrCreateLocalUserId(identity: {
    email: string | null;
    mobile: string | null;
    countryCode: string | null;
    fullName: string | null;
    role: string;
  }): Promise<string | null> {
    const email = identity.email || (identity.mobile ? this.buildSyntheticEmailFromMobile(identity.mobile) : null);
    if (!email) return null;

    let user = await this.userRepository.findOne({ where: { email } });
    if (!user && identity.mobile) {
      // If they previously signed up with a real email but also have mobile, try linking by mobile too.
      user = await this.userRepository.findOne({ where: { mobile: identity.mobile } });
    }

    if (!user) {
      user = (await this.userRepository.save({
        email,
        mobile: identity.mobile || null,
        countryCode: identity.countryCode || null,
        fullName: identity.fullName || null,
        role: identity.role || 'merchant',
        userVerified: true,
        subscriptionTier: 'free',
      } as any)) as User;
      return user.id;
    }

    // Best-effort backfill of mobile / countryCode / name if missing.
    let changed = false;
    if (identity.mobile && !user.mobile) {
      user.mobile = identity.mobile as any;
      changed = true;
    }
    if (identity.countryCode && !user.countryCode) {
      user.countryCode = identity.countryCode as any;
      changed = true;
    }
    if (identity.fullName && !user.fullName) {
      user.fullName = identity.fullName as any;
      changed = true;
    }
    if (identity.role && user.role !== identity.role) {
      // Keep local role consistent with incoming session (merchant/admin) if provided.
      user.role = identity.role as any;
      changed = true;
    }
    if (changed) await this.userRepository.save(user);

    return user.id;
  }

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

  async verifyOtp(
    userId: string,
    otp: string,
    context?: {
      mobileNumber?: string;
      countryCode?: string;
      role?: 'merchant' | 'admin' | string;
    },
  ) {
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
      let upstreamSub =
        decoded?.sub ||
        decoded?.userId ||
        decoded?.id ||
        decoded?._id;

      // Always try to fetch upstream identity once so we can map to a local UUID user.
      // (Upstream user IDs are often not UUIDs, and our DB uses UUIDs for user_id.)
      let upstreamUser: any = null;
      try {
        const v = await axios.get(`${this.baseUrl}/validate-token`, {
          headers: { authorization: `Bearer ${upstreamToken}` },
          timeout: 15000,
          signal: t.signal,
        });
        upstreamUser = (v.data as any)?.user ?? (v.data as any);
      } catch {
        // Best-effort only; if upstream is flaky we still proceed with decoded fields.
      }

      // Backfill upstreamSub if upstream validate-token provided it.
      if (!upstreamSub && upstreamUser) {
        upstreamSub =
          upstreamUser?.userId ||
          upstreamUser?.id ||
          upstreamUser?._id ||
          upstreamUser?.sub;
      }

      const identity = this.pickUpstreamIdentity(upstreamUser, decoded);
      if (context?.mobileNumber && !identity.mobile) {
        identity.mobile = this.normalizeMobileForOtpIdentity(context.mobileNumber);
      }
      if (context?.countryCode && !identity.countryCode) {
        identity.countryCode = String(context.countryCode).trim() || null;
      }
      if (context?.role && !identity.role) {
        identity.role = String(context.role).trim() || 'merchant';
      }
      const localUserId = await this.resolveOrCreateLocalUserId(identity);

      // If we couldn't resolve a local UUID user, fall back to upstream token.
      // This prevents a broken local token that would 500 on UUID-typed queries.
      if (!localUserId) {
        return { token: upstreamToken };
      }

      const localToken = jwt.sign(
        {
          sub: String(localUserId),
          userId: String(localUserId),
          email: identity.email || decoded?.email,
          role: identity.role || decoded?.role || 'merchant',
          upstream: true,
          upstreamSub: upstreamSub ? String(upstreamSub) : undefined,
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

