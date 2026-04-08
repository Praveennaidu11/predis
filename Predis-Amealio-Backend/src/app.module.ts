import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { ContentModule } from './content/content.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AdminModule } from './admin/admin.module';
import { PaymentModule } from './payment/payment.module';
import { SocialModule } from './social/social.module';
import { AIModule } from './integrations/ai/ai.module';
import { MSG91Module } from './integrations/msg91/msg91.module';
import { RazorpayModule } from './integrations/razorpay/razorpay.module';
import { DatabaseService } from './common/database/database.service';
import { RedisService } from './common/redis.service';
import * as entities from './common/entities';

const validateEnv = (env: Record<string, any>) => {
  const required = ['JWT_SECRET'];
  const missing = required.filter((key) => !String(env[key] || '').trim());
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (String(env.IMAGE_API_REQUIRE_AUTH || '').toLowerCase() === 'true') {
    const authToken = env.IMAGE_API_AUTH_TOKEN || env.HUGGINGFACE_API_TOKEN;
    if (!String(authToken || '').trim()) {
      throw new Error('IMAGE_API_REQUIRE_AUTH is true but IMAGE_API_AUTH_TOKEN/HUGGINGFACE_API_TOKEN is missing.');
    }
  }

  return env;
};

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST', 'localhost'),
        port: configService.get('DB_PORT', 5432),
        username: configService.get('DB_USERNAME', 'postgres'),
        password: configService.get('DB_PASSWORD', 'postgres'),
        database: configService.get('DB_NAME', 'amealio_db'),
        entities: Object.values(entities),
        synchronize: configService.get('NODE_ENV') === 'development',
        logging: configService.get('NODE_ENV') === 'development',
      }),
    }),
    AuthModule,
    UserModule,
    ContentModule,
    AnalyticsModule,
    AdminModule,
    PaymentModule,
    SocialModule,
    AIModule,
    MSG91Module,
    RazorpayModule,
  ],
  providers: [DatabaseService, RedisService],
})
export class AppModule {}
