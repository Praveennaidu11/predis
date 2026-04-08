import { Injectable, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import OpenAI from "openai";

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);

  // Legacy fields (kept for video generator / future use)
  private readonly ollamaBaseUrl: string;
  private readonly ollamaModel: string;
  private readonly imageApiBaseUrl: string;

  // Hugging Face configuration
  private readonly hfToken: string;
  private readonly hfDefaultTextModel: string;
  private readonly hfDefaultImageModel: string;
  private readonly imageApiAuthToken: string | null;
  private readonly imageApiRequireAuth: boolean;
  private readonly imageApiTimeoutMs: number;
  private readonly imageApiMaxRetries: number;

  // Multi-model image generation
  private readonly openaiApiKey: string;
  private readonly openaiImageModel: string;
  private readonly googleApiKey: string;
  private readonly geminiApiKey: string;
  private readonly geminiImageModel: string;

  constructor(private configService: ConfigService) {
    this.ollamaBaseUrl =
      this.configService.get("OLLAMA_BASE_URL") || "http://localhost:11434";
    this.ollamaModel = this.configService.get("OLLAMA_MODEL") || "phi3:mini";

    this.imageApiBaseUrl =
      this.configService.get<string>("IMAGE_API_BASE_URL") ||
      "http://54.88.119.163:7860";

    this.hfToken =
      this.configService.get<string>("HUGGINGFACE_API_TOKEN") || "";
    this.hfDefaultTextModel =
      this.configService.get<string>("HF_TEXT_MODEL") ||
      "HuggingFaceH4/zephyr-7b-beta";
    this.hfDefaultImageModel =
      this.configService.get<string>("HF_IMAGE_MODEL") ||
      "stabilityai/sdxl-turbo";
    this.imageApiAuthToken =
      this.configService.get<string>("IMAGE_API_AUTH_TOKEN") ||
      this.configService.get<string>("HUGGINGFACE_API_TOKEN") ||
      null;
    this.imageApiRequireAuth =
      this.configService.get<string>("IMAGE_API_REQUIRE_AUTH") === "true";
    this.imageApiTimeoutMs = Number(
      this.configService.get<string>("IMAGE_API_TIMEOUT_MS") || 180000,
    );
    this.imageApiMaxRetries = Number(
      this.configService.get<string>("IMAGE_API_MAX_RETRIES") || 2,
    );

    if (this.imageApiRequireAuth && !this.imageApiAuthToken) {
      throw new Error(
        "IMAGE_API_REQUIRE_AUTH is true but no IMAGE_API_AUTH_TOKEN/HUGGINGFACE_API_TOKEN is configured.",
      );
    }

    this.openaiApiKey =
      this.configService.get<string>("OPENAI_API_KEY") || "";
    // dall-e-2 works on any billing-enabled account; dall-e-3 requires a paid plan
    this.openaiImageModel =
      this.configService.get<string>("OPENAI_IMAGE_MODEL") || "dall-e-2";

    this.googleApiKey =
      this.configService.get<string>("GOOGLE_API_KEY") || "";
    // Priority: NANO_BANAN_API_KEY (dedicated image gen key) → GEMINI_API_KEY → GOOGLE_API_KEY
    this.geminiApiKey =
      this.configService.get<string>("NANO_BANAN_API_KEY") ||
      this.configService.get<string>("GEMINI_API_KEY") ||
      this.configService.get<string>("GOOGLE_API_KEY") ||
      "";
    // Stable Gemini image generation model (requires billing — no free tier).
    // Override via GEMINI_IMAGE_MODEL in .env if needed.
    this.geminiImageModel =
      this.configService.get<string>("GEMINI_IMAGE_MODEL") ||
      "gemini-2.5-flash-image";
  }

  /* ----------------------------------------------------------
      TEXT GENERATION (Local LLaMA via Ollama)
    ---------------------------------------------------------- */
  async generateText(
    prompt: string,
    model?: string,
    maxTokens: number = 500,
  ): Promise<string> {
    // Use explicitly provided model or fall back to the default local model
    const modelId = model || this.ollamaModel || "phi3:mini";

    try {
      const response = await axios.post(
        `${this.ollamaBaseUrl}/api/chat`,
        {
          model: modelId,
          messages: [
            {
              role: "user",
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
        },
      );

      const data = response.data;

      // Support both the standard Ollama response shape and a generic one
      const text =
        data?.message?.content ||
        (Array.isArray(data?.choices) && data.choices[0]?.message?.content) ||
        (typeof data === "string" ? data : null);

      if (!text?.trim()) {
        throw new Error("Empty response from local LLaMA text generation");
      }

      return text.trim();
    } catch (error: any) {
      this.logger.error(
        "Local LLaMA text generation error",
        error.response?.data || error.message,
      );
      throw new HttpException(
        `Failed to generate text content: ${error.response?.data?.error ||
        error.response?.data?.message ||
        error.message ||
        "Unknown error"
        }`,
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /* ----------------------------------------------------------
      IMAGE GENERATION (External text-to-image API)
    ---------------------------------------------------------- */
  async generateImages(
    prompt: string,
    options?: {
      model?: string;
      style?: string;
      variations?: number;
      referenceImage?: string;
      editMode?: boolean;
      aspectRatio?: string;
      seed?: number;
    },
  ): Promise<string[]> {
    const modelKey = (options?.model || "").toLowerCase();

    if (modelKey === "gpt") {
      return this.generateImagesWithGPT(prompt, options);
    }

    if (modelKey === "gemini") {
      return this.generateImagesWithGemini(prompt, options);
    }

    // QWEN / default path — unchanged
    try {
      const variations = Math.max(1, Math.min(options?.variations || 1, 4));
      const payload: Record<string, unknown> = {
        prompt,
        variations,
      };

      if (options?.model) {
        payload.model = options.model;
      }
      if (options?.style) {
        payload.style = options.style;
      }
      if (options?.referenceImage) {
        payload.reference_image = options.referenceImage;
      }
      if (options?.editMode) {
        payload.mode = "edit";
      }
      if (options?.aspectRatio) {
        payload.aspect_ratio = options.aspectRatio;
      }
      if (typeof options?.seed === "number" && Number.isFinite(options.seed)) {
        payload.seed = Math.floor(options.seed);
        payload.random_seed = Math.floor(options.seed);
      }

      const response = await this.requestImageGeneration(payload);

      const images = this.extractImageResults(response.data);
      if (images.length === 0) {
        throw new Error(
          `Unexpected response format from text-to-image API: ${JSON.stringify(response.data).slice(0, 500)}`,
        );
      }

      return images.slice(0, variations);
    } catch (error: any) {
      this.logger.error(
        "Text-to-image generation error",
        error.response?.data || error.message,
      );
      const message =
        error.response?.data?.error ||
        error.response?.data?.message ||
        error.message ||
        "Failed to generate image";

      throw new HttpException(
        `Image generation failed: ${message}`,
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /* ----------------------------------------------------------
      GPT IMAGE GENERATION (OpenAI Images API)
      Model is read from OPENAI_IMAGE_MODEL env var.
      Default: dall-e-2 (works on any billing-enabled account).
      Override to dall-e-3 for higher quality (requires paid plan).
    ---------------------------------------------------------- */
  private async generateImagesWithGPT(
    prompt: string,
    options?: {
      style?: string;
      variations?: number;
      aspectRatio?: string;
    },
  ): Promise<string[]> {
    if (!this.openaiApiKey) {
      throw new HttpException(
        "OpenAI API key not configured",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const client = new OpenAI({ apiKey: this.openaiApiKey });
    const model = this.openaiImageModel;
    const variations = Math.max(1, Math.min(options?.variations || 1, 4));

    const finalPrompt = options?.style
      ? `${prompt}, ${options.style} style`
      : prompt;

    try {
      let urls: string[];

      if (model === "dall-e-3") {
        // DALL-E 3 only supports n=1 — make parallel requests for variations
        const sizeMap: Record<string, "1024x1024" | "1792x1024" | "1024x1792"> =
        {
          "1:1": "1024x1024",
          "4:5": "1024x1024",
          "16:9": "1792x1024",
          "9:16": "1024x1792",
          "3:2": "1792x1024",
          "2:3": "1024x1792",
        };
        const size: "1024x1024" | "1792x1024" | "1024x1792" =
          (options?.aspectRatio && sizeMap[options.aspectRatio]) || "1024x1024";

        const requests = Array.from({ length: variations }, () =>
          client.images.generate({ model: "dall-e-3", prompt: finalPrompt, n: 1, size }),
        );
        const results = await Promise.all(requests);
        urls = results
          .map((r) => r.data?.[0]?.url)
          .filter((u): u is string => typeof u === "string" && u.length > 0);
      } else {
        // dall-e-2 natively supports n > 1 in a single request
        const result = await client.images.generate({
          model: "dall-e-2",
          prompt: finalPrompt,
          n: variations,
          size: "1024x1024",
        });
        urls = (result.data || [])
          .map((d: any) => d.url)
          .filter((u: any): u is string => typeof u === "string" && u.length > 0);
      }

      if (urls.length === 0) {
        throw new Error("OpenAI image generation returned no results");
      }

      return urls;
    } catch (error: any) {
      // OpenAI SDK throws APIError — extract message from the SDK object,
      // not from axios-style error.response.data
      const message =
        error?.error?.message ||   // nested OpenAI API error body
        error?.message ||           // top-level SDK message
        "Failed to generate image with GPT";

      this.logger.error("GPT image generation error", {
        status: error?.status,
        type: error?.name,
        message,
      });

      throw new HttpException(
        `GPT image generation failed: ${message}`,
        error?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /* ----------------------------------------------------------
      GEMINI IMAGE GENERATION (Google Generative Language REST API)
      Uses axios directly — no extra SDK needed.
      Model must support responseModalities: IMAGE
      (e.g. gemini-2.0-flash-preview-image-generation)
    ---------------------------------------------------------- */
  private async generateImagesWithGemini(
    prompt: string,
    options?: {
      style?: string;
      variations?: number;
    },
  ): Promise<string[]> {
    if (!this.geminiApiKey) {
      throw new HttpException(
        "Gemini API key not configured. Add GEMINI_API_KEY to your .env file.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const variations = Math.max(1, Math.min(options?.variations || 1, 4));
    const finalPrompt = options?.style
      ? `${prompt}, ${options.style} style`
      : prompt;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiImageModel}:generateContent?key=${this.geminiApiKey}`;

    try {
      // Gemini image generation does not support a batch count parameter —
      // fire parallel requests for each requested variation
      const requests = Array.from({ length: variations }, () =>
        axios.post(
          endpoint,
          {
            contents: [{ parts: [{ text: finalPrompt }] }],
            generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
          },
          { timeout: 120000 },
        ),
      );

      const results = await Promise.all(requests);

      const images: string[] = [];
      for (const result of results) {
        const candidates: any[] = result.data?.candidates || [];
        for (const candidate of candidates) {
          const parts: any[] = candidate?.content?.parts || [];
          for (const part of parts) {
            if (part?.inlineData?.data) {
              const mime: string = part.inlineData.mimeType || "image/png";
              images.push(`data:${mime};base64,${part.inlineData.data}`);
            }
          }
        }
      }

      if (images.length === 0) {
        throw new Error(
          "Gemini returned no image data. " +
          `Verify that model '${this.geminiImageModel}' supports image generation ` +
          "and that the GEMINI_API_KEY has the Generative Language API enabled.",
        );
      }

      return images.slice(0, variations);
    } catch (error: any) {
      // Surface the real Google API error message
      const rawMessage: string =
        error.response?.data?.error?.message ||
        error.response?.data?.error?.status ||
        error.message ||
        "Failed to generate image with Gemini";

      // Quota / billing errors → give the user an actionable message
      const isQuotaError =
        error.response?.status === 429 ||
        rawMessage.toLowerCase().includes("quota") ||
        rawMessage.toLowerCase().includes("billing");

      const message = isQuotaError
        ? "Gemini image generation requires billing to be enabled on your Google Cloud project. " +
        "Free API keys cannot generate images. Enable billing at aistudio.google.com/projects " +
        "or use GPT model instead."
        : rawMessage;

      this.logger.error("Gemini image generation error", {
        status: error.response?.status,
        message: rawMessage,
      });

      throw new HttpException(
        `Gemini image generation failed: ${message}`,
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private buildImageApiHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.imageApiAuthToken) {
      headers.Authorization = `Bearer ${this.imageApiAuthToken}`;
      headers["x-api-key"] = this.imageApiAuthToken;
    }

    return headers;
  }

  private async requestImageGeneration(payload: Record<string, unknown>) {
    const endpoint = `${this.imageApiBaseUrl}/generate-text-image`;
    let attempt = 0;

    while (attempt <= this.imageApiMaxRetries) {
      try {
        return await axios.post(endpoint, payload, {
          headers: this.buildImageApiHeaders(),
          timeout: this.imageApiTimeoutMs,
        });
      } catch (error: any) {
        attempt += 1;
        const status = error?.response?.status;
        const isRetryable =
          !status ||
          status >= 500 ||
          error?.code === "ECONNABORTED" ||
          error?.code === "ETIMEDOUT" ||
          error?.code === "ECONNRESET";

        if (!isRetryable || attempt > this.imageApiMaxRetries) {
          throw error;
        }

        const backoffMs = Math.min(1000 * 2 ** attempt, 5000);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    throw new Error("Image generation request failed after retries.");
  }

  async generateImage(prompt: string, p0: string, model: string): Promise<string> {
    const images = await this.generateImages(prompt, { variations: 1 });
    return images[0];
  }

  private extractImageResults(data: any): string[] {
    const collected: string[] = [];

    const pushCandidate = (value: unknown) => {
      if (typeof value !== "string") return;
      const normalized = this.normalizeImageValue(value);
      if (!normalized) return;
      collected.push(normalized);
    };

    // Root-level direct candidates
    pushCandidate(data?.image_url);
    pushCandidate(data?.s3_url);
    pushCandidate(data?.url);
    pushCandidate(data?.image);

    // Root-level array candidates
    if (Array.isArray(data?.images)) {
      for (const entry of data.images) {
        if (typeof entry === "string") {
          pushCandidate(entry);
          continue;
        }
        if (entry && typeof entry === "object") {
          pushCandidate(entry.url);
          pushCandidate(entry.image_url);
          pushCandidate(entry.s3_url);
          pushCandidate(entry.image);
          pushCandidate(entry.b64_json);
          pushCandidate(entry.base64);
        }
      }
    }

    // Common nested object candidates
    if (data?.data && typeof data.data === "object") {
      pushCandidate(data.data.url);
      pushCandidate(data.data.image_url);
      pushCandidate(data.data.s3_url);
      pushCandidate(data.data.image);
      if (Array.isArray(data.data.images)) {
        for (const entry of data.data.images) {
          if (typeof entry === "string") {
            pushCandidate(entry);
          } else if (entry && typeof entry === "object") {
            pushCandidate(entry.url);
            pushCandidate(entry.image_url);
            pushCandidate(entry.s3_url);
            pushCandidate(entry.image);
            pushCandidate(entry.b64_json);
            pushCandidate(entry.base64);
          }
        }
      }
    }

    // Plain string response
    if (typeof data === "string") {
      pushCandidate(data);
    }

    // De-duplicate while preserving order
    return [...new Set(collected)];
  }

  private normalizeImageValue(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith("data:image")) {
      return trimmed;
    }

    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }

    // Treat raw base64 as PNG payload
    return `data:image/png;base64,${trimmed}`;
  }

  /* ----------------------------------------------------------
      VIDEO GENERATION (Text → Video API)
  ---------------------------------------------------------- */
  async generateTextToVideo(
    prompt: string,
    durationSeconds?: number,
  ): Promise<string> {
    const payload: Record<string, unknown> = { prompt };

    if (durationSeconds) {
      payload.duration = durationSeconds;
    }

    try {
      const response = await axios.post(
        "https://textvideogenerator.amealio.com/generate",
        payload,
        {
          headers: { "Content-Type": "application/json" },
          timeout: 180000,
        },
      );

      const data = response.data;

      // 1) Plain string response (URL or data URI)
      if (typeof data === "string") {
        return data;
      }

      // 2) Direct properties on the root object
      if (data) {
        if (typeof data.video_url === "string") return data.video_url;
        if (typeof data.url === "string") return data.url;
        if (typeof data.video === "string") {
          const v = data.video;
          if (v.startsWith("data:video")) return v;
          if (v.startsWith("http")) return v;
          return `data:video/mp4;base64,${v}`;
        }

        // Common generic keys (result, data, output)
        if (typeof data.result === "string") return data.result;
        if (typeof data.data === "string") return data.data;
        if (typeof data.output === "string") return data.output;

        // Nested under .data or .payload
        if (data.data && typeof data.data === "object") {
          const inner = data.data;
          if (typeof inner.video_url === "string") return inner.video_url;
          if (typeof data.s3_url === "string") return data.s3_url; //
          if (typeof inner.url === "string") return inner.url;
          if (typeof inner.video === "string") {
            const v = inner.video;
            if (v.startsWith("data:video")) return v;
            if (v.startsWith("http")) return v;
            return `data:video/mp4;base64,${v}`;
          }
        }

        if (data.payload && typeof data.payload === "object") {
          const inner = data.payload;
          if (typeof inner.url === "string") return inner.url;
          if (typeof data.s3_url === "string") return data.s3_url; //

          if (typeof inner.video_url === "string") return inner.video_url;
        }

        // 3) Array responses – pick first string-like entry
        if (Array.isArray(data) && typeof data[0] === "string") {
          return data[0];
        }

        if (
          Array.isArray(data.results) &&
          typeof data.results[0] === "string"
        ) {
          return data.results[0];
        }
      }

      throw new Error(
        `Unexpected response format from video generator: ${typeof data === "object"
          ? JSON.stringify(data).slice(0, 500)
          : String(data)
        }`,
      );
    } catch (error: any) {
      console.error("AI Video Generation Error:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
      });

      const base = error.response?.data ?? {};

      const errorMessage =
        base.message ||
        base.detail ||
        base.error ||
        error.message ||
        "Failed to generate video";

      throw new HttpException(
        `Video generation failed: ${errorMessage}`,
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /* ----------------------------------------------------------
      SOCIAL MEDIA POST GENERATION (uses HF text)
    ---------------------------------------------------------- */
  async generateSocialMediaPost(
    topic: string,
    platform: string,
    tone: string = "professional",
    model?: string,
    outputType: "caption" | "hashtags" | "summary" | "generic" = "generic",
  ): Promise<string> {
    const platformGuidelines = {
      instagram:
        "Keep it visual and engaging with emojis. Max 2200 characters. Include hashtags.",
      facebook: "Conversational and community-focused.",
      linkedin: "Professional and value-driven.",
      twitter: "Concise & impactful. Max 280 characters.",
      tiktok: "Fun, trendy, with a CTA.",
    };

    const guidelines =
      platformGuidelines[platform.toLowerCase()] || "Create engaging content";

    let outputInstructions: string;

    switch (outputType) {
      case "caption":
        outputInstructions = [
          "Generate ONLY 3-5 short Instagram-style captions.",
          "Return one caption per line.",
          "Do not include any extra text, labels, or explanations.",
        ].join(" ");
        break;
      case "hashtags":
        outputInstructions = [
          "Generate ONLY hashtags relevant to the topic.",
          "Return them on a single line separated by spaces.",
          "Do not include any other words, sentences, or explanations.",
        ].join(" ");
        break;
      case "summary":
        outputInstructions = [
          "Provide ONLY a concise summary suitable for this platform.",
          "Do not add any preamble such as 'Here is the summary'.",
        ].join(" ");
        break;
      case "generic":
      default:
        outputInstructions =
          "Write a complete social media post following the guidelines above.";
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
