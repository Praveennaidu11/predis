import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);

  // Legacy fields (kept for video generator / future use)
  private readonly ollamaBaseUrl: string;
  private readonly ollamaModel: string;
  private readonly imageApiBaseUrl: string;
  private readonly videoApiUrl: string;
  private readonly videoApiSendOptions: boolean;
  private readonly tempDir: string;
  private readonly backendBaseUrl: string;

  // GPT (OpenAI) configuration
  private readonly openaiApiKey: string | undefined;
  private readonly gptModel: string;

  // Gemini (AI Studio) configuration
  private readonly googleApiKey: string | undefined;
  private readonly geminiModel: string;

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

    this.tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
    this.backendBaseUrl = this.configService.get('BACKEND_URL') || 'http://localhost:8001';

    this.openaiApiKey = this.configService.get<string>('OPENAI_API_KEY');
    this.gptModel = this.configService.get<string>('GPT_MODEL') || 'gpt-4o-mini';

    this.googleApiKey =
      this.configService.get<string>('GEMINI_API_KEY') ||
      this.configService.get<string>('GOOGLE_API_KEY');
    this.geminiModel = this.configService.get<string>('GEMINI_MODEL') || 'gemini-flash-latest';

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
    // Provider routing: if caller requests GPT, try OpenAI.
    if (model === 'gpt') {
      try {
        return await this.generateTextWithGPT(prompt, maxTokens);
      } catch (error: any) {
        const errorMsg =
          error?.response?.data?.error?.message ||
          error?.response?.data?.message ||
          error?.message ||
          'Unknown error';

        this.logger.warn(`GPT text generation failed: ${errorMsg}`);

        throw new HttpException(
          `GPT generation failed: ${errorMsg}`,
          error?.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }

    // Provider routing: if caller requests Gemini, try Gemini then fall back to Ollama.
    if (model === 'gemini') {
      try {
        return await this.generateTextWithGemini(prompt, maxTokens);
      } catch (error: any) {
        const errorMsg =
          error?.response?.data?.error?.message ||
          error?.response?.data?.message ||
          error?.message ||
          'Unknown error';

        this.logger.warn(`Gemini text generation failed: ${errorMsg}`);

        // If Gemini was explicitly requested, we don't fall back to local Ollama
        // because Ollama is likely not configured or running on the same machine.
        throw new HttpException(
          `Gemini generation failed: ${errorMsg}`,
          error?.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }

    // Use explicitly provided model (except gemini) or fall back to the default local model
    const modelId = model && model !== 'gemini' ? model : this.ollamaModel || 'phi3:mini';

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

  private async generateTextWithGemini(prompt: string, maxTokens: number): Promise<string> {
    if (!this.googleApiKey) {
      throw new Error('GOOGLE_API_KEY is not configured');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:generateContent?key=${this.googleApiKey}`;

    const body: any = {
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: Math.min(Math.max(maxTokens, 64), 2048),
      },
    };

    try {
      const res = await axios.post(url, body, { timeout: 60000 });
      const text =
        res.data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text || typeof text !== 'string') {
        throw new Error('Empty response from Gemini');
      }
      return text.trim();
    } catch (error: any) {
      if (error.response?.status === 404) {
        // Try v1 if v1beta fails with 404
        const v1Url = `https://generativelanguage.googleapis.com/v1/models/${this.geminiModel}:generateContent?key=${this.googleApiKey}`;
        const v1Res = await axios.post(v1Url, body, { timeout: 60000 });
        const v1Text = v1Res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (v1Text) return v1Text.trim();
      }
      throw error;
    }
  }

  private async generateTextWithGPT(prompt: string, maxTokens: number): Promise<string> {
    if (!this.openaiApiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const url = 'https://api.openai.com/v1/chat/completions';

    const body = {
      model: this.gptModel,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    };

    const res = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${this.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    });

    const text = res.data?.choices?.[0]?.message?.content;

    if (!text || typeof text !== 'string') {
      throw new Error('Empty response from GPT');
    }
    return text.trim();
  }

  /* ----------------------------------------------------------
      IMAGE GENERATION (External text-to-image API)
    ---------------------------------------------------------- */
  async generateImage(prompt: string): Promise<string> {
    try {
      // Attempt A: legacy endpoint (/generate)
      let response: any;
      try {
        response = await axios.post(
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
          },
        );
      } catch (e: any) {
        // Many deployments use the "Unified AI Generator" API instead.
        // If /generate is missing, try /generate-text-image.
        const status = e?.response?.status;
        if (status !== 404) throw e;
        this.logger.warn(
          `Image API /generate not found (404). Falling back to /generate-text-image on ${this.imageApiBaseUrl}`,
        );

        response = await axios.post(
          `${this.imageApiBaseUrl}/generate-text-image`,
          { prompt },
          { timeout: 120000 },
        );
      }

      const data = response?.data;

      // URL-based responses
      let imageUrl =
        data?.url ||
        data?.image_url ||
        data?.imageUrl ||
        data?.s3_url ||
        data?.images?.[0] ||
        data?.result?.url ||
        data?.result?.image_url;

      // Base64-based responses
      if (!imageUrl) {
        const b64 =
          data?.image_base64 ||
          data?.image ||
          (Array.isArray(data?.images) && typeof data.images[0] === 'string' ? data.images[0] : null);

        if (b64 && typeof b64 === 'string') {
          imageUrl = this.persistBase64ImageToTemp(b64);
        }
      }

      if (!imageUrl) {
        throw new Error('No image returned from image generation API');
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

  private persistBase64ImageToTemp(raw: string): string {
    // Accept either "data:image/png;base64,..." or bare base64.
    const match = raw.match(/^data:([^;]+);base64,(.+)$/);
    const mime = match?.[1] || 'image/png';
    const base64 = match?.[2] || raw;

    const ext =
      mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png';
    const fileName = `img_${Date.now()}_${uuidv4()}.${ext}`;
    const localPath = path.join(this.tempDir, fileName);
    fs.writeFileSync(localPath, Buffer.from(base64, 'base64'));

    return `${this.backendBaseUrl}/temp/${fileName}`;
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
    }
  ): Promise<string | string[]> {
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

      // Option A: allow routing "long duration" requests to a different endpoint/provider.
      // Many providers cap the default endpoint to a short preview length.
      const longVideoApiUrl =
        this.configService.get<string>('TEXT_TO_VIDEO_API_URL_LONG') ||
        this.configService.get<string>('VIDEO_API_URL_LONG') ||
        '';
      const videoApiUrlToUse = duration > 5 && longVideoApiUrl ? longVideoApiUrl : this.videoApiUrl;

      const payload: any = {
        prompt,
        // Option C: send multiple duration keys for compatibility across providers.
        // Some APIs expect `duration`, others `seconds`/`length`/`duration_seconds`.
        duration: duration,
        duration_seconds: duration,
        seconds: duration,
        length: duration,
        num_clips: numClips,
        model: apiModel,
        video_type: options.videoType || 'text-to-video',
        platform: options.platform || 'instagram',
      };

      this.logger.log(
        `Sending video generation request to ${videoApiUrlToUse} with payload: ${JSON.stringify(payload)}`,
      );

      if (options.images && options.images.length > 0) {
        payload.images = options.images;
      }

      const response = await axios.post(videoApiUrlToUse, payload, {
        timeout: 300000, // Video generation can be slow
      });

      // Log a small, safe summary of the response to diagnose duration issues.
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
          videosCount: Array.isArray(response.data?.videos) ? response.data.videos.length : undefined,
        };
        this.logger.log(`Video API response summary: ${JSON.stringify(summary)}`);
      } catch {
        // ignore logging failures
      }

      const videoData = response.data?.video_url || response.data?.videos || response.data?.url || response.data?.s3_url;

      if (!videoData) {
        throw new Error('No video URL returned from video generation API');
      }

      return videoData;
    } catch (error: any) {
      this.logger.error('Video generation error', error.response?.data || error.message);
      throw new HttpException(
        `Failed to generate video: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
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
