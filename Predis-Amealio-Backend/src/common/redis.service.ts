import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis | null = null;
  private readonly logger = new Logger(RedisService.name);

  constructor(private configService: ConfigService) {
    const enabled = this.configService.get<string>('REDIS_ENABLED') !== 'false';

    if (enabled) {
      this.client = new Redis({
        host: this.configService.get<string>('REDIS_HOST') || 'localhost',
        port: +(this.configService.get<string>('REDIS_PORT') || '6379'),
        lazyConnect: true,
        retryStrategy: (times) => {
          // Give up after 3 retries to avoid blocking the server startup
          if (times > 3) return null;
          return Math.min(times * 300, 2000);
        },
      });

      this.client.on('connect', () => this.logger.log('Redis connected'));
      this.client.on('error', (err) =>
        this.logger.warn(`Redis unavailable — caching disabled: ${err.message}`),
      );
    } else {
      this.logger.log('Redis disabled via REDIS_ENABLED=false — running without cache');
    }
  }

  async onModuleInit() {
    if (this.client) {
      await this.client.connect().catch(() => {
        // Swallow connection error — service falls back to DB-only mode
      });
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit().catch(() => {});
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    return this.client.get(key).catch(() => null);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (!this.client) return;
    try {
      if (ttl) {
        await this.client.set(key, value, 'EX', ttl);
      } else {
        await this.client.set(key, value);
      }
    } catch {
      // Cache write failure is non-fatal
    }
  }

  async del(key: string): Promise<number> {
    if (!this.client) return 0;
    return this.client.del(key).catch(() => 0);
  }

  async exists(key: string): Promise<boolean> {
    if (!this.client) return false;
    return this.client.exists(key).then((r) => r === 1).catch(() => false);
  }
}
