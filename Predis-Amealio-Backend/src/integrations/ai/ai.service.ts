import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GoogleAuth } from 'google-auth-library';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);
  private readonly vertexAuth: GoogleAuth;

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

    this.openaiApiKey = this.configService.get<string>('OPENAI_API_KEY')?.trim();
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

    this.vertexAuth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
  }

  private mapDurationToVeo(durationSeconds: number): number {
    // Veo 3/3.1 accept 4, 6, 8 (per docs). Map our UI (5/10/15) to closest supported.
    if (durationSeconds <= 5) return 6;
    return 8;
  }

  private parseDataImage(dataUrl: string): { mimeType: string; bytesBase64Encoded: string } {
    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/);
    if (!match) throw new Error('Invalid image data URL');
    return { mimeType: match[1], bytesBase64Encoded: match[2] };
  }

  private async getVertexAccessToken(): Promise<string> {
    const client = await this.vertexAuth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = typeof tokenResponse === 'string' ? tokenResponse : tokenResponse?.token;
    if (!token) throw new Error('Unable to obtain Google access token for Vertex AI');
    return token;
  }

  private async resolveVertexProjectId(): Promise<string> {
    const configured = this.configService.get<string>('GCP_PROJECT_ID');
    if (configured && configured !== 'your_gcp_project_id') return configured;
    const inferred = await this.vertexAuth.getProjectId();
    if (inferred) return inferred;
    throw new Error('GCP_PROJECT_ID is not configured');
  }

  private async generateVeo3Video(
    prompt: string,
    options: { durationSeconds: number; images?: string[]; aspectRatio?: '16:9' | '9:16' },
  ): Promise<string> {
    const projectId = await this.resolveVertexProjectId();
    const region = this.configService.get<string>('GCP_REGION') || 'us-central1';
    const modelId = this.configService.get<string>('VERTEX_VEO3_MODEL') || 'veo-3.1-generate-001';
    const storageUriBase = this.configService.get<string>('VEO3_OUTPUT_STORAGE_URI');

    if (!storageUriBase || storageUriBase.startsWith('gs://your-bucket')) {
      throw new Error('VEO3_OUTPUT_STORAGE_URI is not configured (must be a gs:// bucket/prefix)');
    }

    const durationSeconds = this.mapDurationToVeo(options.durationSeconds);
    const storageUri = storageUriBase.endsWith('/')
      ? `${storageUriBase}${uuidv4()}/`
      : `${storageUriBase}/${uuidv4()}/`;

    const endpoint = `https://${region}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(
      projectId,
    )}/locations/${encodeURIComponent(
      region,
    )}/publishers/google/models/${encodeURIComponent(modelId)}:predictLongRunning`;

    const instance: any = { prompt };

    if (options.images && options.images.length > 0) {
      instance.referenceImages = options.images.slice(0, 3).map((img) => {
        if (img.startsWith('data:image/')) {
          const parsed = this.parseDataImage(img);
          return {
            image: parsed,
            referenceType: 'asset',
          };
        }
        if (img.startsWith('gs://')) {
          return {
            image: { gcsUri: img },
            referenceType: 'asset',
          };
        }
        throw new Error('Veo3 images must be data:image/... base64 or gs:// URIs');
      });
    }

    const body: any = {
      instances: [instance],
      parameters: {
        storageUri,
        sampleCount: 1,
        durationSeconds,
        aspectRatio: options.aspectRatio || '9:16',
        resolution: '720p',
      },
    };

    const token = await this.getVertexAccessToken();
    const start = await axios.post(endpoint, body, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      timeout: 30000,
    });

    const operationName: string = start.data?.name;
    if (!operationName) throw new Error('Vertex Veo did not return operation name');

    const pollEndpoint = `https://${region}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(
      projectId,
    )}/locations/${encodeURIComponent(
      region,
    )}/publishers/google/models/${encodeURIComponent(modelId)}:fetchPredictOperation`;

    const deadline = Date.now() + 6 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5000));
      const pollToken = await this.getVertexAccessToken();
      const pollRes = await axios.post(
        pollEndpoint,
        { operationName },
        {
          headers: {
            Authorization: `Bearer ${pollToken}`,
            'Content-Type': 'application/json; charset=utf-8',
          },
          timeout: 30000,
        },
      );

      if (pollRes.data?.done) {
        const videos = pollRes.data?.response?.videos;
        const gcsUri = Array.isArray(videos) ? videos?.[0]?.gcsUri : undefined;
        if (!gcsUri) throw new Error('Vertex Veo completed but no output gcsUri was returned');
        return gcsUri;
      }
    }

    throw new Error('Vertex Veo timed out while waiting for video generation');
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
        const status = error?.response?.status;
        const quotaLike =
          status === 429 ||
          /quota|billing|insufficient|usage limit/i.test(String(errorMsg));

        if (quotaLike && this.googleApiKey) {
          this.logger.warn(
            `GPT unavailable (${status ?? 'n/a'}): ${errorMsg}. Falling back to Gemini.`,
          );
          try {
            return await this.generateTextWithGemini(prompt, maxTokens);
          } catch (geminiErr: any) {
            const geminiMsg =
              geminiErr?.response?.data?.error?.message ||
              geminiErr?.response?.data?.message ||
              geminiErr?.message ||
              'Unknown error';
            this.logger.warn(`Gemini fallback after GPT failure also failed: ${geminiMsg}`);
            
            // Map upstream auth failures away from 401/403 to prevent UI logout
            const safeStatus = (status === 401 || status === 403) 
              ? HttpStatus.BAD_GATEWAY 
              : (status || HttpStatus.INTERNAL_SERVER_ERROR);

            throw new HttpException(
              `GPT generation failed: ${errorMsg}`,
              safeStatus,
            );
          }
        }

        this.logger.warn(`GPT text generation failed: ${errorMsg}`);

        // Never return 401/403 to the frontend from an upstream provider,
        // as it triggers automatic logout in the UI.
        const safeStatus = (status === 401 || status === 403) 
          ? HttpStatus.BAD_GATEWAY 
          : (status || HttpStatus.INTERNAL_SERVER_ERROR);

        throw new HttpException(
          `GPT generation failed: ${errorMsg}`,
          safeStatus,
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

        const status = error?.response?.status;
        const safeStatus = (status === 401 || status === 403)
          ? HttpStatus.BAD_GATEWAY
          : (status || HttpStatus.INTERNAL_SERVER_ERROR);

        // If Gemini was explicitly requested, we don't fall back to local Ollama
        // because Ollama is likely not configured or running on the same machine.
        throw new HttpException(
          `Gemini generation failed: ${errorMsg}`,
          safeStatus,
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

  private async generateTextWithGemini(prompt: string, maxTokens: number, retryCount = 0): Promise<string> {
    if (!this.googleApiKey || this.googleApiKey === 'your_google_api_key') {
      throw new Error('GOOGLE_API_KEY is not configured or has default value');
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
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
    };

    try {
      const res = await axios.post(url, body, { timeout: 60000 });
      
      // Check if response was blocked by safety filters
      if (res.data?.candidates?.[0]?.finishReason === 'SAFETY') {
        throw new Error('Gemini blocked the response due to safety filters. Try a different prompt.');
      }

      const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      const usage = res.data?.usageMetadata;

      if (usage) {
        this.logger.log(`Gemini Usage: ${usage.promptTokenCount} prompt, ${usage.candidatesTokenCount} completion, ${usage.totalTokenCount} total tokens`);
      }

      if (!text || typeof text !== 'string') {
        throw new Error('Empty response from Gemini');
      }
      return text.trim();
    } catch (error: any) {
      const status = error.response?.status;

      // Retry logic for transient errors (503 Service Unavailable, 429 Rate Limit)
      if ((status === 503 || status === 429) && retryCount < 2) {
        this.logger.warn(`Gemini API returned ${status}. Retrying in 2 seconds... (Attempt ${retryCount + 1})`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return this.generateTextWithGemini(prompt, maxTokens, retryCount + 1);
      }

      if (status === 404) {
        // Try v1 if v1beta fails with 404
        const v1Url = `https://generativelanguage.googleapis.com/v1/models/${this.geminiModel}:generateContent?key=${this.googleApiKey}`;
        const v1Res = await axios.post(v1Url, body, { timeout: 60000 });
        const v1Text = v1Res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (v1Text) return v1Text.trim();
      }
      throw error;
    }
  }

  private async generateTextWithGPT(prompt: string, maxTokens: number, retryCount = 0): Promise<string> {
    if (!this.openaiApiKey || this.openaiApiKey === 'your_openai_api_key') {
      throw new Error('OPENAI_API_KEY is not configured or has default value');
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

    try {
      const res = await axios.post(url, body, {
        headers: {
          Authorization: `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      });

      const text = res.data?.choices?.[0]?.message?.content;
      const usage = res.data?.usage;

      if (usage) {
        this.logger.log(`GPT Usage: ${usage.prompt_tokens} prompt, ${usage.completion_tokens} completion, ${usage.total_tokens} total tokens`);
      }

      if (!text || typeof text !== 'string') {
        throw new Error('Empty response from GPT');
      }
      return text.trim();
    } catch (error: any) {
      const status = error.response?.status;
      const errorData = error.response?.data?.error;
      const errorMsg = errorData?.message || error.message || String(error);

      // Handle 429 Rate Limit or 500/503 Transient errors with retry
      if ((status === 429 || status === 500 || status === 503) && retryCount < 2) {
        const delay = status === 429 ? 5000 : 2000; // Wait longer for rate limits
        this.logger.warn(
          `GPT API returned ${status}: ${errorMsg}. Retrying in ${delay / 1000}s... (Attempt ${retryCount + 1})`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.generateTextWithGPT(prompt, maxTokens, retryCount + 1);
      }

      throw error;
    }
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
      const status = error?.response?.status;
      const safeStatus = (status === 401 || status === 403)
        ? HttpStatus.BAD_GATEWAY
        : HttpStatus.INTERNAL_SERVER_ERROR;

      throw new HttpException(
        `Failed to generate image: ${error.message}`,
        safeStatus
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
    if (d.includes('payment required') || d.includes('pre-paid credits') || d.includes('prepaid credits') || d.includes('usage limit')) {
      return HttpStatus.PAYMENT_REQUIRED;
    }
    // Cloudflare timeout from generator
    if (d.includes('error code 524') || d.includes('a timeout occurred') || d.includes('status code 524')) {
      return HttpStatus.GATEWAY_TIMEOUT;
    }

    // Upstream auth errors
    if (d.includes('unauthorized') || d.includes('invalid api key') || d.includes('forbidden')) {
      return HttpStatus.BAD_GATEWAY;
    }

    return HttpStatus.INTERNAL_SERVER_ERROR;
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
      audio?: string;
    }
  ): Promise<string> {
    try {
      if (options.model === 'veo3') {
        const durationSeconds = options.durationSeconds || 6;
        const aspectRatio =
          (options.platform || '').toLowerCase() === 'instagram' ? '9:16' : '16:9';
        return await this.generateVeo3Video(prompt, {
          durationSeconds,
          images: options.images,
          aspectRatio,
        });
      }

      // Map frontend model names to API expected values ('local' or 'hf')
      let apiModel = 'local';
      if (options.model === 'wan' || options.model === 'ltx' || options.model === 'local') {
        apiModel = 'local';
      } else if (options.model === 'hf') {
        apiModel = 'hf';
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

      let response;
      try {
        response = await axios.post(videoApiUrlToUse, payload, {
          timeout: 300000,
        });
      } catch (err: any) {
        const detail = this.formatVideoApiError(err);
        const status = this.inferHttpStatusForVideoError(detail);

        // If the hosted generator is out of credits (402) and we requested HF,
        // automatically retry with the free/local model so the app still works.
        if (status === HttpStatus.PAYMENT_REQUIRED && payload.model === 'hf') {
          this.logger.warn(
            `Hosted video generator returned 402; retrying with local model. Detail: ${detail}`,
          );
          const retryPayload = { ...payload, model: 'local' };
          const retrySummary = { ...logSummary, model: 'local' };
          this.logger.log(
            `Retrying video generation request to ${videoApiUrlToUse} with payload: ${JSON.stringify(
              retrySummary,
            )}`,
          );
          response = await axios.post(videoApiUrlToUse, retryPayload, {
            timeout: 300000,
          });
        } else {
          throw err;
        }
      }

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

      const lower = String(detail).toLowerCase();
      const status = this.inferHttpStatusForVideoError(detail);

      throw new HttpException(`Failed to generate video: ${detail}`, status);
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

  /**
   * 3–5 ready-to-paste prompt strings for the merchant "prompt" box, from a short user fragment.
   * Uses Gemini when configured; returns [] on failure so callers can use keyword fallbacks.
   */
  async suggestMerchantPromptStarters(params: {
    userFragment: string;
    platform: string;
    contentType: 'text' | 'image' | 'video';
    textType?: string;
    tone?: string;
    videoType?: string;
  }): Promise<string[]> {
    if (!this.googleApiKey || this.googleApiKey === 'your_google_api_key') {
      return [];
    }

    const { userFragment, platform, contentType, textType, tone, videoType } = params;
    const lines = [
      'You generate short prompt ideas for a social media content AI.',
      'The user typed a fragment (may be vague). Expand it into concrete, copy-paste-ready prompts.',
      `Platform: ${platform}. Content type: ${contentType}.`,
      textType ? `Text mode: ${textType}.` : '',
      tone ? `Tone: ${tone}.` : '',
      videoType ? `Video format: ${videoType}.` : '',
      'Return exactly 5 distinct suggestions.',
      'Each suggestion must be ONE complete instruction (one short paragraph max).',
      'No numbering, bullets, or labels.',
      'Output ONLY valid JSON with this exact shape:',
      '{"suggestions":["...","...","...","...","..."]}',
    ].filter(Boolean);

    const prompt = `${lines.join('\n')}\n\nUser fragment:\n"""${userFragment.trim().replace(/"/g, "'")}"""`;

    try {
      const raw = await this.generateTextWithGemini(prompt, 1024);
      return this.parseJsonSuggestionArray(raw).slice(0, 5);
    } catch (e: any) {
      this.logger.warn(
        `suggestMerchantPromptStarters: ${e?.message || e}`,
      );
      return [];
    }
  }

  private parseJsonSuggestionArray(raw: string): string[] {
    let t = raw.trim();
    if (t.startsWith('```')) {
      t = t.replace(/^```(?:json)?\s*/i, '').replace(/```[\s]*$/i, '').trim();
    }
    try {
      const obj = JSON.parse(t);
      const arr = obj?.suggestions ?? obj?.prompts;
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((s: unknown) => typeof s === 'string' && String(s).trim().length > 0)
        .map((s: string) => String(s).trim());
    } catch {
      return [];
    }
  }
}
