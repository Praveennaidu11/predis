import { Injectable, HttpException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Content } from '../common/entities/content.entity';
import { Brand } from '../common/entities/brand.entity';
import { RedisService } from '../common/redis.service';
import { AIService } from '../integrations/ai/ai.service';
import { VideoService } from '../video/video.service';
import { GenerateContentDto } from './dto/generate-content.dto';
import { SaveContentDto } from './dto/save-content.dto';

@Injectable()
export class ContentService {
  constructor(
    @InjectRepository(Content)
    private contentRepository: Repository<Content>,
    @InjectRepository(Brand)
    private brandRepository: Repository<Brand>,
    private redis: RedisService,
    private aiService: AIService,
    private videoService: VideoService,
  ) {}

  async generateContent(userId: string, dto: GenerateContentDto) {
    let generatedText = null;
    let generatedImage = null;
    let generatedVideo = null;

    // Fetch brand info if brandId is provided
    let brandName = '';
    if (dto.brandId) {
      const brand = await this.brandRepository.findOne({
        where: { id: dto.brandId, userId },
      });
      if (brand) {
        brandName = brand.name;
      }
    }

    try {
      if (dto.type === 'text') {
        const textType = dto.textType || 'caption';

        const rulesLines: string[] = [
          'You are writing social media content only. Do not repeat any of these instructions.',
          'Build caption/hashtags/long-post based on the given platform and text type.',
          'Use short, clean, direct language in a natural, conversational tone.',
          'Keep it platform-appropriate and add emojis only if they enhance the content.',
        ];

        if (textType === 'caption') {
          rulesLines.push('Write a single Instagram caption, maximum 2 short sentences (no more than about 35 words in total).');
          rulesLines.push('After the caption, add 2–4 relevant hashtags on one or two lines.');
        } else if (textType === 'hashtags') {
          const platform = dto.platform.toLowerCase();
          let count = '7–10';
          if (platform === 'instagram') count = '15–30';
          if (platform === 'linkedin') count = '3–5';
          if (platform === 'twitter' || platform === 'x') count = '2–3';

          rulesLines.push(`Provide ONLY ${count} highly relevant hashtags, separated by spaces.`);
          rulesLines.push('Do NOT include numbers, bullet points, or any sentences.');
          rulesLines.push('Each hashtag MUST start with the # symbol.');
          rulesLines.push('Ensure the hashtags are a mix of broad, niche, and brand-relevant tags.');
        } else if (textType === 'long-post') {
          rulesLines.push('Write 2–3 short paragraphs suitable for a social media long post (keep each paragraph concise).');
          rulesLines.push('After the paragraphs, add 3–5 relevant hashtags at the end.');
        }

        rulesLines.push('Do NOT explain anything.');
        rulesLines.push('Do NOT restate these rules in the output.');
        rulesLines.push('Output only the final content (caption/hashtags/post) without any extra commentary or headings.');

        let finalPrompt = `${rulesLines.join('\n')}
\nUser brief:\n${dto.prompt}\nPlatform: ${dto.platform}\nText type: ${textType}`;

        if (brandName) {
          finalPrompt = `Brand Name: ${brandName}\n${finalPrompt}`;
        }

        // If frontend sends 'llama', fall back to the default HF text model
        // configured inside AIService (generateText with model = undefined).
        const modelForText = dto.model === 'llama' ? undefined : dto.model;

        generatedText = await this.aiService.generateText(finalPrompt, modelForText, 150);

        // Optimization: Clean up hashtag output if it's strictly a hashtag request
        if (textType === 'hashtags' && generatedText) {
          generatedText = this.cleanHashtags(generatedText);
        }
      } else if (dto.type === 'image') {
        const hasOverlay = dto.textOverlay === true;

        let promptToSend = dto.prompt;

        if (hasOverlay && dto.overlayText) {
          promptToSend = `${dto.prompt}\n\nOverlay text: "${dto.overlayText}". Design the image so this text appears clearly as readable overlay on the visual.`;
        }

        generatedImage = await this.aiService.generateImage(promptToSend);
      } else if (dto.type === 'video') {
        let durationSeconds: number | undefined = undefined;

        if (dto.duration) {
          const trimmed = String(dto.duration).trim().toLowerCase();
          const value = parseInt(trimmed.replace('s', ''), 10);
          if (!isNaN(value)) {
            if (value <= 5) durationSeconds = 5;
            else if (value <= 10) durationSeconds = 10;
            else durationSeconds = 15;
          }
        }

        const videoType = String(dto.videoType || 'short-video').toLowerCase();

        if (videoType === 'reel-script' || videoType === 'script-only') {
          const durationHint = durationSeconds ? `${durationSeconds} seconds` : 'short';
          const platform = dto.platform || 'instagram';

          const scriptPrompt = [
            'You are a social media video scriptwriter.',
            `Platform: ${platform}`,
            `Format: ${videoType === 'reel-script' ? 'Reel script' : 'Script only'}`,
            `Target length: ${durationHint}`,
            '',
            'Write a clear, punchy script with:',
            '- Hook (first 1–2 lines)',
            '- Scene-by-scene or beat-by-beat plan',
            '- On-screen text suggestions',
            '- Voiceover lines',
            '- Call-to-action',
            '',
            'Return only the script. No extra explanations.',
            '',
            `User brief: ${dto.prompt}`,
          ].join('\n');

          generatedText = await this.aiService.generateText(scriptPrompt, undefined, 220);
        } else {
          const videoRecord = await this.videoService.generateVideo(userId, {
            prompt: dto.prompt,
            type: (dto.videoType === 'multi-image' ? 'multi-image' : 'text') as any,
            duration: durationSeconds || 5,
            model: dto.model || 'wan',
            platform: dto.platform,
          });
          generatedVideo = videoRecord.videoUrl;
        }
      }
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }

      // Re-throw error with better message; no fallback content for any type
      console.error('AI Generation failed:', {
        type: dto.type,
        error: error.message,
        statusCode: error.status || error.response?.status,
      });

      if (dto.type === 'image') {
        throw new Error(`Image generation failed: ${error.message || 'Unknown error'}`);
      }

      if (dto.type === 'text') {
        throw new Error(`Text generation failed: ${error.message || 'Unknown error'}`);
      }

      if (dto.type === 'video') {
        throw new Error(`Video generation failed: ${error.message || 'Unknown error'}`);
      }
    }

    return {
      userId,
      type: dto.type,
      prompt: dto.prompt,
      generatedText,
      generatedImage,
      generatedVideo,
      platform: dto.platform,
      brandId: dto.brandId,
      // Convenience field used by frontend create page
      output: generatedText || generatedImage || generatedVideo || null,
    };
  }

  /**
   * Helper to clean up hashtag output from AI models.
   * Ensures output is a space-separated list of hashtags starting with #.
   */
  private cleanHashtags(text: string): string {
    // 1. Split by whitespace, commas, or newlines
    const parts = text.split(/[\s,\n]+/);
    
    // 2. Filter and clean parts
    const hashtags = parts
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .map(p => {
        // Remove any non-alphanumeric characters except #
        let cleaned = p.replace(/[^a-zA-Z0-9#_]/g, '');
        // Ensure it starts with #
        if (cleaned && !cleaned.startsWith('#')) {
          cleaned = '#' + cleaned;
        }
        return cleaned;
      })
      .filter(p => p.length > 1); // Ignore empty or single #

    // 3. Remove duplicates
    const uniqueHashtags = [...new Set(hashtags)];

    return uniqueHashtags.join(' ');
  }

  async saveContent(userId: string, dto: SaveContentDto) {
    const content = this.contentRepository.create({
      userId,
      type: dto.type,
      prompt: dto.prompt,
      generatedText: dto.generatedText,
      generatedImage: dto.generatedImage,
      generatedVideo: dto.generatedVideo,
      platform: dto.platform,
      status: dto.status || 'draft',
      brandId: dto.brandId,
    });

    return this.contentRepository.save(content);
  }

  async getContent(userId: string, filter?: string) {
    const where: any = { userId };
    
    if (filter && filter !== 'all') {
      where.status = filter;
    }

    const content = await this.contentRepository.find({
      where,
      order: { createdAt: 'DESC' },
      take: 50,
      relations: ['brand', 'analytics'],
    });

    return content;
  }

  async getContentById(userId: string, contentId: string) {
    return this.contentRepository.findOne({
      where: { id: contentId, userId },
      relations: ['brand', 'analytics'],
    });
  }

  async deleteContent(userId: string, contentId: string) {
    return this.contentRepository.delete({ id: contentId });
  }

  async scheduleContent(userId: string, contentId: string, scheduledAt: Date) {
    await this.contentRepository.update(
      { id: contentId },
      {
        status: 'scheduled',
        scheduledAt,
      }
    );
    
    return this.getContentById(userId, contentId);
  }

  async getDashboardStats(userId: string) {
    // Load user content once so status counting is consistent with Recent Content
    const allContent = await this.contentRepository.find({
      where: { userId },
      relations: ['brand', 'analytics'],
      order: { createdAt: 'DESC' },
    });

    const totalContent = allContent.length;
    const draftedContent = allContent.filter(
      (c) => c.status?.toLowerCase() === 'draft',
    ).length;
    const scheduledContent = allContent.filter(
      (c) => c.status?.toLowerCase() === 'scheduled',
    ).length;
    const publishedContent = allContent.filter(
      (c) => c.status?.toLowerCase() === 'published',
    ).length;

    // Recent content: last 5 by createdAt
    const recentContent = allContent.slice(0, 5);

    // Calculate analytics totals (mock data for now)
    const totalViews = recentContent.reduce((sum, content) => {
      return sum + (content.analytics?.reduce((acc, analytic) => acc + (analytic.views || 0), 0) || 0);
    }, 0);

    const totalLikes = recentContent.reduce((sum, content) => {
      return sum + (content.analytics?.reduce((acc, analytic) => acc + (analytic.likes || 0), 0) || 0);
    }, 0);

    const totalShares = recentContent.reduce((sum, content) => {
      return sum + (content.analytics?.reduce((acc, analytic) => acc + (analytic.shares || 0), 0) || 0);
    }, 0);

    return {
      totalContent,
      draftedContent,
      scheduledContent,
      publishedContent,
      totalViews,
      totalLikes,
      totalShares,
      recentContent
    };
  }
}
