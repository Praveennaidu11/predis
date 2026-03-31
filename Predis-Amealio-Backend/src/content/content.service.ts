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
          rulesLines.push('Write a single Instagram caption, maximum 2 short sentences.');
          rulesLines.push('After the caption, add 20 unique hashtags.');
        } else if (textType === 'hashtags') {
          rulesLines.push(`Provide 30 highly relevant hashtags, separated by spaces.`);
          rulesLines.push('Each hashtag MUST start with the # symbol.');
        } else if (textType === 'long-post') {
          rulesLines.push('Write a very detailed, long-form social media post.');
          rulesLines.push('The content should be at least 20 lines long.');
          rulesLines.push('Structure: Hook, Body (detailed), and Call-to-action.');
          rulesLines.push('Use double line breaks (\n\n) between paragraphs.');
          rulesLines.push('After the content, add 20 relevant hashtags.');
        }

        rulesLines.push('Return ONLY the final content. No intro or commentary.');

        let finalPrompt = `${rulesLines.join('\n')}
\nUser brief: ${dto.prompt}\nPlatform: ${dto.platform}\nText type: ${textType}`;

        if (brandName) {
          finalPrompt = `Brand Name: ${brandName}\n${finalPrompt}`;
        }

        if (dto.tone) {
          finalPrompt = `Tone: ${dto.tone}\n${finalPrompt}`;
        }

        // Add final constraints to ensure the model follows the rules
        const finalConstraints = [
          '\n\n--- REQUIREMENTS ---',
          '1. Provide at least 20 hashtags starting with #.',
          textType === 'long-post' 
            ? '2. The text content must be very detailed and exceed 20 lines.' 
            : '',
          '3. Return ONLY the content.',
        ].filter(Boolean).join('\n');

        finalPrompt += finalConstraints;

        // If frontend sends 'llama', fall back to the default HF text model
        // configured inside AIService (generateText with model = undefined).
        const modelForText = dto.model === 'llama' ? undefined : dto.model;

        // If audio is provided, we should ideally transcribe it or mention it in the prompt
        // For now, let's append a note to the AI that this prompt was derived from voice
        let finalInputPrompt = dto.prompt;
        if (dto.audio && !dto.prompt) {
          finalInputPrompt = "Analyze the provided audio context and generate content.";
        }

        const maxTokens = textType === 'long-post' ? 1200 : 400;
        generatedText = await this.aiService.generateText(finalPrompt, modelForText, maxTokens);

        // Optimization: Clean up hashtag output if it's strictly a hashtag request
        if (textType === 'hashtags' && generatedText) {
          generatedText = this.cleanHashtags(generatedText);
        }
      } else if (dto.type === 'image') {
        const hasOverlay = dto.textOverlay === true;

        let promptToSend = dto.prompt;

        // If user explicitly chose Gemini for an image, use Gemini to enhance the prompt
        // before calling the actual image generator.
        if (dto.model === 'gemini') {
          try {
            const enhancementPrompt = `Refine this image generation prompt to be more descriptive, creative, and specific for high-quality social media content. Prompt: "${dto.prompt}"\n\nReturn only the refined prompt. No preamble. No explanations. If the prompt is inappropriate, return the word "REFUSED".`;
            const enhanced = await this.aiService.generateText(enhancementPrompt, 'gemini', 150);
            
            if (enhanced && enhanced.trim().toUpperCase() !== 'REFUSED' && enhanced.length > 5) {
              promptToSend = enhanced;
            } else {
              console.warn('Gemini refused enhancement or returned empty, using original prompt');
            }
          } catch (e: any) {
            console.warn('Gemini prompt enhancement failed, falling back to original prompt:', e.message);
          }
        }

        if (hasOverlay && dto.overlayText) {
          promptToSend = `${promptToSend}\n\nOverlay text: "${dto.overlayText}". Design the image so this text appears clearly as readable overlay on the visual.`;
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
      // Re-throw if already an HttpException (like the one thrown from AIService)
      if (error?.status || error?.response?.status) {
        throw error;
      }

      // Re-throw error with better message; no fallback content for any type
      console.error('AI Generation failed:', {
        type: dto.type,
        error: error.message,
        statusCode: error.status || error.response?.status,
      });

      throw new HttpException(
        `${dto.type.charAt(0).toUpperCase() + dto.type.slice(1)} generation failed: ${error.message || 'Unknown error'}`,
        500,
      );
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
