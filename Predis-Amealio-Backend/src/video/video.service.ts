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
import { pipeline } from 'stream/promises';
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

  private resolveAbsoluteVideoUrl(url: unknown): string {
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid video URL from generator');
    }
    const trimmed = url.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }
    const base =
      this.configService.get<string>('TEXT_TO_VIDEO_API_URL') ||
      this.configService.get<string>('VIDEO_API_URL') ||
      'https://textvideogenerator.amealio.com/generate';
    try {
      const origin = new URL(base).origin;
      return new URL(trimmed.startsWith('/') ? trimmed : `/${trimmed}`, origin).href;
    } catch {
      throw new Error(`Could not resolve video download URL: ${trimmed}`);
    }
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
        audio: dto.audio,
      });

      const sourceUrl = this.resolveAbsoluteVideoUrl(result);

      // 4. Download to local storage to fix CORS and range-request issues
      // This allows the video to play reliably in the frontend
      this.logger.log(`Downloading video from ${sourceUrl} for local serving`);
      const fileName = `video_${video.id}_${uuidv4()}.mp4`;
      const localPath = path.join(this.tempDir, fileName);

      const response = await axios.get(sourceUrl, {
        responseType: 'stream',
        timeout: 600000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
      const writer = fs.createWriteStream(localPath);
      await pipeline(response.data, writer);

      const finalVideoUrl = `${this.baseUrl}/temp/${fileName}`;

      // 5. Update video record
      video.status = 'done';
      video.videoUrl = finalVideoUrl;
      await this.videoRepository.save(video);

      return video;
    } catch (error: any) {
      const msg =
        error instanceof HttpException
          ? String(error.message)
          : error?.response?.data
            ? JSON.stringify(error.response.data).slice(0, 500)
            : error?.message || String(error);
      this.logger.error(`Video generation failed for ${video.id}: ${msg}`);
      video.status = 'failed';
      video.metadata = { ...video.metadata, error: msg };
      await this.videoRepository.save(video);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(msg, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getVideo(id: string) {
    return this.videoRepository.findOne({ where: { id } });
  }
}
