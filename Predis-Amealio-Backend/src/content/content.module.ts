import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContentService } from './content.service';
import { PromptHistoryService } from './prompt-history.service';
import { ContentController } from './content.controller';
import { Content } from '../common/entities/content.entity';
import { Brand } from '../common/entities/brand.entity';
import { User } from '../common/entities/user.entity';
import { Analytics } from '../common/entities/analytics.entity';
import { PromptHistory } from '../common/entities/prompt-history.entity';
import { RedisService } from '../common/redis.service';
import { AIModule } from '../integrations/ai/ai.module';
import { SocialModule } from '../social/social.module';
import { ContentSchedulerService } from './content-scheduler.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Content, Brand, User, Analytics, PromptHistory]),
    AIModule,
    SocialModule,
  ],
  controllers: [ContentController],
  providers: [ContentService, PromptHistoryService, RedisService],
  exports: [ContentService, PromptHistoryService],
})
export class ContentModule {}
