import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { Analytics } from '../common/entities/analytics.entity';
import { Content } from '../common/entities/content.entity';
import { RedisService } from '../common/redis.service';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([Analytics, Content])],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, RedisService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
