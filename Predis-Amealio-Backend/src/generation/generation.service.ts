import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GenerationJob } from '../common/entities/generation-job.entity';
import { CreateGenerationJobDto } from './dto/create-generation-job.dto';
import { AIService } from '../integrations/ai/ai.service';
import { VideoService } from '../video/video.service';
import { GeminiService } from './providers/gemini.service';

@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);

  constructor(
    @InjectRepository(GenerationJob)
    private jobs: Repository<GenerationJob>,
    private aiService: AIService,
    private videoService: VideoService,
    private gemini: GeminiService,
  ) {}

  /**
   * Why we create a DB-backed job:
   * - Video/image generation can take time and fail intermittently.
   * - The frontend (Merchant + Admin) needs a stable job ID to poll for status.
   */
  async createJob(requestingUser: { userId: string; role?: string }, dto: CreateGenerationJobDto) {
    const job = this.jobs.create({
      userId: requestingUser.userId,
      requestedRole: requestingUser.role || null,
      recipe: dto.recipe as any,
      status: 'queued',
      prompt: dto.prompt || null,
      provider: dto.provider || 'gemini',
      model: dto.model || null,
      platform: dto.platform || null,
      duration: dto.duration ?? null,
      input: dto.input || null,
      output: null,
      error: null,
    });

    const saved = await this.jobs.save(job);

    // Run async in-process (dev-first). Later we can move to a queue worker.
    setImmediate(() => {
      this.processJob(saved.id).catch((e) => {
        this.logger.error(`Failed to process job ${saved.id}: ${e?.message || e}`);
      });
    });

    return saved;
  }

  async getJobForUser(jobId: string, requestingUser: { userId: string; role?: string }) {
    const job = await this.jobs.findOne({ where: { id: jobId } });
    if (!job) return null;

    // Admins can view any job; merchants can view only theirs
    if (requestingUser.role === 'admin') return job;
    if (job.userId === requestingUser.userId) return job;
    return null;
  }

  private async processJob(jobId: string) {
    const job = await this.jobs.findOne({ where: { id: jobId } });
    if (!job) return;

    job.status = 'processing';
    job.error = null;
    await this.jobs.save(job);

    try {
      const recipe = job.recipe;
      const platform = job.platform || undefined;
      const duration = job.duration || 5;

      if (recipe === 'text_to_image') {
        const userPrompt = job.prompt || '';
        const prompt = await this.safeGeminiEnhancePrompt(userPrompt, 'image', platform);

        const imageUrl = await this.aiService.generateImage(prompt);
        job.output = { imageUrl, promptUsed: prompt };
        job.status = 'done';
        await this.jobs.save(job);
        return;
      }

      if (recipe === 'image_to_image') {
        const inputImage = job.input?.inputImage;
        if (!inputImage) {
          throw new Error('input.inputImage is required for image_to_image');
        }

        const userPrompt = (job.prompt || '').trim();

        // Bridge Image→Image using Gemini vision description + text-to-image generation.
        const baseDescription = await this.safeGeminiDescribeImage(inputImage);

        const combined = userPrompt
          ? `Input image description: ${baseDescription}\n\nUser edit request: ${userPrompt}`
          : `Input image description: ${baseDescription}\n\nGenerate a similar image with minor stylistic improvements.`;

        const prompt = await this.safeGeminiEnhancePrompt(combined, 'image', platform);

        const imageUrl = await this.aiService.generateImage(prompt);
        job.output = { imageUrl, promptUsed: prompt, inputDescription: baseDescription };
        job.status = 'done';
        await this.jobs.save(job);
        return;
      }

      if (recipe === 'text_to_video') {
        const userPrompt = job.prompt || '';
        const prompt = await this.safeGeminiEnhancePrompt(userPrompt, 'video', platform);

        const video = await this.videoService.generateVideo(job.userId || '', {
          prompt,
          type: 'text',
          duration: duration as any,
          model: job.model || 'wan',
          platform,
        } as any);

        job.output = { videoUrl: video.videoUrl, promptUsed: prompt, videoId: video.id };
        job.status = 'done';
        await this.jobs.save(job);
        return;
      }

      if (recipe === 'first_last_prompt_to_video') {
        const firstFrame = job.input?.firstFrame;
        const lastFrame = job.input?.lastFrame;
        if (!firstFrame || !lastFrame) {
          throw new Error('input.firstFrame and input.lastFrame are required');
        }

        const userPrompt = job.prompt || '';
        const prompt = await this.safeGeminiEnhancePrompt(userPrompt, 'video', platform);

        const video = await this.videoService.generateVideo(job.userId || '', {
          prompt,
          type: 'multi-image',
          images: [firstFrame, lastFrame],
          duration: duration as any,
          model: job.model || 'wan',
          platform,
        } as any);

        job.output = { videoUrl: video.videoUrl, promptUsed: prompt, videoId: video.id };
        job.status = 'done';
        await this.jobs.save(job);
        return;
      }

      if (recipe === 'first_last_to_video') {
        const firstFrame = job.input?.firstFrame;
        const lastFrame = job.input?.lastFrame;
        if (!firstFrame || !lastFrame) {
          throw new Error('input.firstFrame and input.lastFrame are required');
        }

        // Gemini vision generates a prompt when the user does not provide one.
        const prompt = await this.safeGeminiPromptFromFirstLastFrames(firstFrame, lastFrame, platform);

        const video = await this.videoService.generateVideo(job.userId || '', {
          prompt,
          type: 'multi-image',
          images: [firstFrame, lastFrame],
          duration: duration as any,
          model: job.model || 'wan',
          platform,
        } as any);

        job.output = { videoUrl: video.videoUrl, promptUsed: prompt, videoId: video.id };
        job.status = 'done';
        await this.jobs.save(job);
        return;
      }

      if (recipe === 'ugc_create') {
        const brief = (job.prompt || '').trim();
        if (!brief) {
          throw new Error('prompt is required for ugc_create');
        }

        const pack = await this.safeGeminiUgcPack(brief, platform);

        job.output = { ugc: pack };
        job.status = 'done';
        await this.jobs.save(job);
        return;
      }

      throw new Error(`Unsupported recipe: ${recipe}`);
    } catch (e: any) {
      job.status = 'failed';
      job.error = e?.message || String(e);
      await this.jobs.save(job);
      return;
    }
  }

  /**
   * Why these safe wrappers:
   * - Gemini free tier can hit quota / rate limits.
   * - Gemini should enhance the pipeline, not be a single point of failure.
   */
  private async safeGeminiEnhancePrompt(
    prompt: string,
    kind: 'image' | 'video',
    platform?: string,
  ): Promise<string> {
    if (!this.gemini.isConfigured()) return prompt;
    try {
      return await this.gemini.enhancePrompt({ prompt, kind, platform });
    } catch (e: any) {
      this.logger.warn(`Gemini enhancePrompt failed, continuing without it: ${e?.message || e}`);
      return prompt;
    }
  }

  private async safeGeminiDescribeImage(inputImage: string): Promise<string> {
    if (!this.gemini.isConfigured()) return 'A photo of the provided input image.';
    try {
      return await this.gemini.describeImage({ image: inputImage });
    } catch (e: any) {
      this.logger.warn(`Gemini describeImage failed, continuing without it: ${e?.message || e}`);
      return 'A photo of the provided input image.';
    }
  }

  private async safeGeminiPromptFromFirstLastFrames(
    firstFrame: string,
    lastFrame: string,
    platform?: string,
  ): Promise<string> {
    if (!this.gemini.isConfigured()) {
      return 'Create a smooth cinematic transition from the first image to the last image.';
    }
    try {
      return await this.gemini.promptFromFirstLastFrames({ firstFrame, lastFrame, platform });
    } catch (e: any) {
      this.logger.warn(`Gemini promptFromFirstLastFrames failed, continuing without it: ${e?.message || e}`);
      return 'Create a smooth cinematic transition from the first image to the last image.';
    }
  }

  private async safeGeminiUgcPack(brief: string, platform?: string) {
    if (!this.gemini.isConfigured()) return { hooks: [], captions: [], hashtags: [], shotlist: [] };
    try {
      return await this.gemini.ugcPack({ brief, platform });
    } catch (e: any) {
      this.logger.warn(`Gemini ugcPack failed, continuing with empty pack: ${e?.message || e}`);
      return { hooks: [], captions: [], hashtags: [], shotlist: [] };
    }
  }
}

