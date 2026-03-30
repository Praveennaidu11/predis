import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Video } from '../common/entities/video.entity';
import { CreateVideoDto } from './dto/create-video.dto';
import { AIService } from '../integrations/ai/ai.service';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);
  private readonly tempDir = path.join(process.cwd(), 'temp');
  private readonly baseUrl: string;

  constructor(
    @InjectRepository(Video)
    private videoRepository: Repository<Video>,
    private aiService: AIService,
    private configService: ConfigService,
  ) {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
    this.baseUrl = this.configService.get('BACKEND_URL') || 'http://localhost:8001';
  }

  async generateVideo(userId: string, dto: CreateVideoDto) {
    // 1. Convert duration
    const seconds = typeof dto.duration === 'string'
      ? parseInt(dto.duration)
      : dto.duration;

    // 2. Create initial video record
    const video = this.videoRepository.create({
      userId,
      prompt: dto.prompt,
      duration: seconds,
      status: 'processing',
      metadata: { type: dto.type, model: dto.model, platform: dto.platform },
    });
    await this.videoRepository.save(video);

    try {
      // 3. Call AI Service with requested duration
      this.logger.log(`Generating ${seconds}s video for ${video.id}`);

      const result = await this.aiService.generateTextToVideo(dto.prompt, {
        durationSeconds: seconds,
        model: dto.model,
        videoType: dto.type,
        platform: dto.platform,
        images: dto.images,
      });

      let sourceUrl: string;

      if (Array.isArray(result)) {
        sourceUrl = result[0];
      } else if (result) {
        sourceUrl = result;
      } else {
        throw new Error('No video URL returned from AI service');
      }

      // 4. Download to local storage to fix CORS and range-request issues
      // This allows the video to play reliably in the frontend
      this.logger.log(`Downloading video from ${sourceUrl} for local serving`);
      const fileName = `video_${video.id}_${uuidv4()}.mp4`;
      const localPath = path.join(this.tempDir, fileName);
      
      const response = await axios.get(sourceUrl, { responseType: 'stream' });
      const writer = fs.createWriteStream(localPath);
      response.data.pipe(writer);
      
      await new Promise<void>((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      const finalVideoUrl = `${this.baseUrl}/temp/${fileName}`;

      // 5. Update video record
      video.status = 'done';
      video.videoUrl = finalVideoUrl;
      await this.videoRepository.save(video);

      return video;
    } catch (error: any) {
      this.logger.error(`Video generation failed for ${video.id}: ${error.message}`);
      video.status = 'failed';
      video.metadata = { ...video.metadata, error: error.message };
      await this.videoRepository.save(video);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getVideo(id: string) {
    return this.videoRepository.findOne({ where: { id } });
  }
}
