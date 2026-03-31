import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GenerationJob } from '../common/entities/generation-job.entity';
import { GenerationController } from './generation.controller';
import { GenerationService } from './generation.service';
import { AIModule } from '../integrations/ai/ai.module';
import { VideoModule } from '../video/video.module';
import { GeminiService } from './providers/gemini.service';

@Module({
  imports: [TypeOrmModule.forFeature([GenerationJob]), AIModule, VideoModule],
  controllers: [GenerationController],
  providers: [GenerationService, GeminiService],
  exports: [GenerationService],
})
export class GenerationModule {}

