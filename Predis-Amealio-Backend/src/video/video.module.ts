import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Video } from '../common/entities/video.entity';
import { VideoController } from './video.controller';
import { VideoService } from './video.service';
import { AIModule } from '../integrations/ai/ai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Video]),
    AIModule,
  ],
  controllers: [VideoController],
  providers: [VideoService],
  exports: [VideoService],
})
export class VideoModule {}
