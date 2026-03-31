import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);

  // Legacy fields (kept for video generator / future use)
  private readonly ollamaBaseUrl: string;
  private readonly ollamaModel: string;
  private readonly imageApiBaseUrl: string;
  private readonly videoApiUrl: string;
  private readonly videoApiSendOptions: boolean;

  // Hugging Face configuration
  private readonly hfToken: string;
  private readonly hfDefaultTextModel: string;
  private readonly hfDefaultImageModel: string;

  constructor(private configService: ConfigService) {
    this.ollamaBaseUrl = this.configService.get('OLLAMA_BASE_URL') || 'http://localhost:11434';
    this.ollamaModel = this.configService.get('OLLAMA_MODEL') || 'phi3:mini';

    this.imageApiBaseUrl = this.configService.get('IMAGE_API_BASE_URL') || 'http://54.88.119.163:7860';
    this.videoApiUrl =
      this.configService.get<string>('TEXT_TO_VIDEO_API_URL') ||
      this.configService.get<string>('VIDEO_API_URL') ||
      'https://textvideogenerator.amealio.com/generate';
    this.videoApiSendOptions =
      String(
        this.configService.get<string>('TEXT_TO_VIDEO_SEND_OPTIONS') ||
          this.configService.get<string>('VIDEO_SEND_OPTIONS') ||
          'true', // Default to true so options are sent
      ).toLowerCase() === 'true';

    this.hfToken = this.configService.get<string>('HUGGINGFACE_API_TOKEN')!;
    this.hfDefaultTextModel =
      this.configService.get<string>('HF_TEXT_MODEL') || 'HuggingFaceH4/zephyr-7b-beta';
    this.hfDefaultImageModel =
      this.configService.get<string>('HF_IMAGE_MODEL') || 'stabilityai/sdxl-turbo';
  }

  /* ----------------------------------------------------------
      TEXT GENERATION (Local LLaMA via Ollama)
    ---------------------------------------------------------- */
  async generateText(
    prompt: string,
    model?: string,
    maxTokens: number = 500
  ): Promise<string> {
    // Use explicitly provided model or fall back to the default local model
    const modelId = model || this.ollamaModel || 'phi3:mini';

    try {
      const response = await axios.post(
        `${this.ollamaBaseUrl}/api/chat`,
        {
          model: modelId,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
          stream: false,
          options: {
            // Ollama-specific generation options; maxTokens is a soft cap
            num_predict: maxTokens,
          },
        },
        {
          timeout: 120000,
        }
      );

      const data = response.data;

      // Support both the standard Ollama response shape and a generic one
      const text =
        data?.message?.content ||
        (Array.isArray(data?.choices) && data.choices[0]?.message?.content) ||
        (typeof data === 'string' ? data : null);

      if (!text?.trim()) {
        throw new Error('Empty response from local LLaMA text generation');
      }

      return text.trim();
    } catch (error: any) {
      this.logger.error('Local LLaMA text generation error', error.response?.data || error.message);
      throw new HttpException(
        `Failed to generate text content: ${
          error.response?.data?.error ||
          error.response?.data?.message ||
          error.message ||
          'Unknown error'
        }`,
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /* ----------------------------------------------------------
      IMAGE GENERATION (External text-to-image API)
    ---------------------------------------------------------- */
  async generateImage(prompt: string): Promise<string> {
    try {
      const response = await axios.post(
        `${this.imageApiBaseUrl}/generate`,
        {
          prompt,
          model: this.hfDefaultImageModel,
        },
        {
          headers: {
            Authorization: `Bearer ${this.hfToken}`,
          },
          timeout: 60000,
        }
      );

      const imageUrl = response.data?.url || response.data?.image_url || response.data?.images?.[0];

      if (!imageUrl) {
        throw new Error('No image URL returned from image generation API');
      }

      return imageUrl;
    } catch (error: any) {
      this.logger.error('Image generation error', error.response?.data || error.message);
      throw new HttpException(
        `Failed to generate image: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /** Hosted generator expects `text-to-video` / `image-to-video`, not DTO enums like `text`. */
  private mapVideoTypeForExternalApi(
    internalType: string | undefined,
    hasImages: boolean,
  ): string {
    if (hasImages) {
      return 'image-to-video';
    }
    const t = (internalType || 'text').toLowerCase();
    if (t === 'image' || t === 'multi-image') {
      return 'image-to-video';
    }
    return 'text-to-video';
  }

  private extractVideoUrlFromResponse(data: any): string {
    if (!data) {
      throw new Error('No video URL returned from video generation API');
    }
    if (typeof data === 'string') {
      return data;
    }
    if (Array.isArray(data)) {
      if (data.length === 0) {
        throw new Error('Empty videos array from video generation API');
      }
      const first = data[0];
      if (typeof first === 'string') {
        return first;
      }
      if (first && typeof first === 'object') {
        const u =
          first.url ||
          first.video_url ||
          first.s3_url ||
          first.href;
        if (typeof u === 'string') {
          return u;
        }
      }
    }
    if (typeof data === 'object') {
      const u =
        data.video_url ||
        data.url ||
        data.s3_url ||
        data.href;
      if (typeof u === 'string') {
        return u;
      }
    }
    throw new Error(
      'Video generation API returned a response without a usable video URL',
    );
  }

  private formatVideoApiError(error: any): string {
    const d = error?.response?.data;
    if (d == null) {
      return error?.message || String(error);
    }
    if (typeof d === 'string') {
      return d;
    }
    if (typeof d === 'object') {
      const msg =
        d.detail ||
        d.message ||
        d.error ||
        d.msg;
      if (typeof msg === 'string') {
        return msg;
      }
      try {
        return JSON.stringify(d).slice(0, 800);
      } catch {
        return error?.message || 'Unknown';
      }
    }
    return error?.message || String(error);
  }

  private inferHttpStatusForVideoError(detail: string): number {
    const d = (detail || '').toLowerCase();
    // Upstream sometimes wraps a 402 into a 500 body; surface as 402 for UI.
    if (d.includes('payment required') || d.includes('pre-paid credits') || d.includes('prepaid credits')) {
      return HttpStatus.PAYMENT_REQUIRED;
    }
    // Cloudflare timeout from generator
    if (d.includes('error code 524') || d.includes('a timeout occurred') || d.includes('status code 524')) {
      return HttpStatus.GATEWAY_TIMEOUT;
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  /* ----------------------------------------------------------
      VIDEO GENERATION (External text-to-video API)
    ---------------------------------------------------------- */
  async generateTextToVideo(
    prompt: string,
    options: {
      durationSeconds?: number;
      model?: string;
      videoType?: string;
      platform?: string;
      images?: string[];
      audio?: string;
    }
  ): Promise<string> {
    try {
      // Map frontend model names to API expected values ('local' or 'hf')
      let apiModel = 'local';
      if (options.model === 'veo3' || options.model === 'hf') {
        apiModel = 'hf';
      } else if (options.model === 'wan' || options.model === 'ltx' || options.model === 'local') {
        apiModel = 'local';
      }

      const duration = options.durationSeconds || 5;
      /**
       * Important: Some upstream generators return an array of clips when `num_clips > 1`.
       * Our backend download pipeline currently persists only a single MP4 for playback.
       * To ensure the requested duration (5/10/15s) is respected, we request a single clip
       * of the full duration rather than multiple 5s segments.
       */
      const numClips = 1;

      const longVideoApiUrl =
        this.configService.get<string>('TEXT_TO_VIDEO_API_URL_LONG') ||
        this.configService.get<string>('VIDEO_API_URL_LONG') ||
        '';
      const videoApiUrlToUse = duration > 5 && longVideoApiUrl ? longVideoApiUrl : this.videoApiUrl;

      const hasImages = !!(options.images && options.images.length > 0);
      const externalVideoType = this.mapVideoTypeForExternalApi(
        options.videoType,
        hasImages,
      );

      const payload: any = {
        prompt,
        duration: duration,
        duration_seconds: duration,
        seconds: duration,
        length: duration,
        num_clips: numClips,
        model: apiModel,
        video_type: externalVideoType,
        platform: options.platform || 'instagram',
      };

      if (options.images && options.images.length > 0) {
        payload.images = options.images;
      }

      if (options.audio) {
        payload.audio = options.audio;
      }

      const logSummary = {
        ...payload,
        images: payload.images
          ? `[${payload.images.length} image(s), base64 omitted]`
          : undefined,
        audio: payload.audio ? '[omitted]' : undefined,
      };
      this.logger.log(
        `Sending video generation request to ${videoApiUrlToUse} with payload: ${JSON.stringify(logSummary)}`,
      );

      const response = await axios.post(videoApiUrlToUse, payload, {
        timeout: 300000,
      });

      if (
        typeof response.data === 'string' &&
        /^https?:\/\//i.test(response.data.trim())
      ) {
        return response.data.trim();
      }

      try {
        const summary = {
          keys: response.data ? Object.keys(response.data) : [],
          durationRequested: duration,
          numClipsRequested: numClips,
          type:
            response.data?.video_url
              ? 'video_url'
              : response.data?.videos
                ? 'videos'
                : response.data?.url
                  ? 'url'
                  : response.data?.s3_url
                    ? 's3_url'
                    : typeof response.data,
          videosCount: Array.isArray(response.data?.videos)
            ? response.data.videos.length
            : undefined,
        };
        this.logger.log(`Video API response summary: ${JSON.stringify(summary)}`);
      } catch {
        // ignore
      }

      const raw =
        response.data?.video_url ||
        response.data?.videos ||
        response.data?.url ||
        response.data?.s3_url ||
        response.data?.result ||
        response.data?.output;

      return this.extractVideoUrlFromResponse(raw);
    } catch (error: any) {
      const detail = this.formatVideoApiError(error);
      this.logger.error(`Video generation error: ${detail}`);
      const status = this.inferHttpStatusForVideoError(detail);
      throw new HttpException(
        `Failed to generate video: ${detail}`,
        status,
      );
    }
  }

  async generateSocialContent(
    topic: string,
    platform: string,
    tone: string = 'professional',
    model?: string,
    outputType: 'caption' | 'hashtags' | 'summary' | 'generic' = 'generic'
  ): Promise<string> {
    const platformGuidelines = {
      instagram: 'Keep it visual and engaging with emojis. Max 2200 characters. Include hashtags.',
      facebook: 'Conversational and community-focused.',
      linkedin: 'Professional and value-driven.',
      twitter: 'Concise & impactful. Max 280 characters.',
      tiktok: 'Fun, trendy, with a CTA.',
    };

    const guidelines =
      platformGuidelines[platform.toLowerCase()] || 'Create engaging content';

    let outputInstructions: string;

    switch (outputType) {
      case 'caption':
        outputInstructions = [
          'Generate ONLY 3-5 short Instagram-style captions.',
          'Return one caption per line.',
          'Do not include any extra text, labels, or explanations.',
        ].join(' ');
        break;
      case 'hashtags':
        outputInstructions = [
          'Generate ONLY hashtags relevant to the topic.',
          'Return them on a single line separated by spaces.',
          'Do not include any other words, sentences, or explanations.',
        ].join(' ');
        break;
      case 'summary':
        outputInstructions = [
          'Provide ONLY a concise summary suitable for this platform.',
          "Do not add any preamble such as 'Here is the summary'.",
        ].join(' ');
        break;
      case 'generic':
      default:
        outputInstructions = 'Write a complete social media post following the guidelines above.';
        break;
    }

    const prompt = `
You are a social media content assistant.

Platform: ${platform}
Tone: ${tone}
Topic: ${topic}
Guidelines: ${guidelines}

${outputInstructions}
`;

    return this.generateText(prompt, model, 300);
  }
}
