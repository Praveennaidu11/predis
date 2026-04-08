import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from "@nestjs/common";
import axios from "axios";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { createHash, randomUUID } from "crypto";
import { lookup } from "dns/promises";
import { isIP } from "net";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { Content } from "../common/entities/content.entity";
import { Brand } from "../common/entities/brand.entity";
import { RedisService } from "../common/redis.service";
import { AIService } from "../integrations/ai/ai.service";
import { GenerateContentDto } from "./dto/generate-content.dto";
import { SaveContentDto } from "./dto/save-content.dto";
import { GenerateImageDto } from "./dto/generate-image.dto";
import { EditImageDto } from "./dto/edit-image.dto";
import { UpdateContentDto } from "./dto/update-content.dto";
import { SocialService } from "../social/social.service";

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);
  private readonly imageRateWindowMs: number;
  private readonly imageRateLimitPerWindow: number;
  private readonly imageStorageMode: string;
  private readonly imageStorageDir: string;
  private readonly imageStoragePublicBaseUrl: string | null;
  private readonly imageEditMaxRetries: number;
  private readonly saveDedupeWindowMs: number;
  private readonly rateLimitStore = new Map<string, number[]>();

  constructor(
    @InjectRepository(Content)
    private contentRepository: Repository<Content>,
    @InjectRepository(Brand)
    private brandRepository: Repository<Brand>,
    private redis: RedisService,
    private aiService: AIService,
    private configService: ConfigService,
    private socialService: SocialService,
  ) {
    this.imageRateWindowMs = Number(
      this.configService.get("IMAGE_RATE_LIMIT_WINDOW_MS") || 60000,
    );
    this.imageRateLimitPerWindow = Number(
      this.configService.get("IMAGE_RATE_LIMIT_PER_WINDOW") || 20,
    );
    this.imageStorageMode = String(
      this.configService.get("IMAGE_STORAGE_MODE") || "none",
    ).toLowerCase();
    this.imageStorageDir =
      this.configService.get("IMAGE_STORAGE_DIR") ||
      join(process.cwd(), "uploads", "generated-images");
    this.imageStoragePublicBaseUrl =
      this.configService.get("IMAGE_STORAGE_PUBLIC_BASE_URL") || null;
    this.imageEditMaxRetries = Number(
      this.configService.get("IMAGE_EDIT_MAX_RETRIES") || 2,
    );
    this.saveDedupeWindowMs = Number(
      this.configService.get("CONTENT_SAVE_DEDUPE_WINDOW_MS") || 30000,
    );
  }

  private readonly allowedImageStyles = new Set([
    "realistic",
    "cartoon",
    "cinematic",
    "minimalist",
    "digital-art",
    "3d-render",
    "watercolor",
  ]);
  private readonly allowedAspectRatios = new Set([
    "1:1",
    "4:5",
    "9:16",
    "16:9",
    "3:2",
    "2:3",
  ]);

  private normalizePrompt(prompt: string): string {
    const cleaned = String(prompt || "")
      .replace(/\s+/g, " ")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      .trim();

    if (!cleaned) {
      throw new BadRequestException("Prompt is required for image generation.");
    }

    if (cleaned.length < 5) {
      throw new BadRequestException(
        "Prompt must be at least 5 characters long.",
      );
    }

    if (cleaned.length > 1000) {
      throw new BadRequestException(
        "Prompt must be less than or equal to 1000 characters.",
      );
    }

    return cleaned;
  }

  private normalizeStyle(style?: string): string | null {
    if (!style) return null;

    const cleaned = style.trim().toLowerCase();
    if (!cleaned) return null;

    if (!this.allowedImageStyles.has(cleaned)) {
      throw new BadRequestException(
        `Unsupported style "${style}". Allowed styles: ${Array.from(this.allowedImageStyles).join(", ")}`,
      );
    }

    return cleaned;
  }

  private normalizeVariations(variations?: number): number {
    if (variations === undefined || variations === null) {
      return 1;
    }

    if (!Number.isInteger(variations) || variations < 1 || variations > 4) {
      throw new BadRequestException(
        "Variations must be an integer between 1 and 4.",
      );
    }

    return variations;
  }

  private normalizeAspectRatio(aspectRatio?: string): string | null {
    if (!aspectRatio) return null;
    const cleaned = String(aspectRatio).trim();
    if (!cleaned) return null;
    if (!this.allowedAspectRatios.has(cleaned)) {
      throw new BadRequestException(
        `Unsupported aspect ratio "${aspectRatio}". Allowed ratios: ${Array.from(this.allowedAspectRatios).join(", ")}`,
      );
    }
    return cleaned;
  }

  private buildImagePrompt(
    prompt: string,
    options: {
      style: string | null;
      aspectRatio: string | null;
      overlayText?: string | null;
      editMode?: boolean;
      previousPrompt?: string | null;
    },
  ): string {
    const lines: string[] = [prompt];

    if (options.overlayText?.trim()) {
      lines.push(`Overlay text: "${options.overlayText.trim()}".`);
    }

    if (options.style) {
      lines.push(`Style: ${options.style}`);
    }

    if (options.aspectRatio) {
      lines.push(`Aspect ratio: ${options.aspectRatio}`);
    }

    if (options.editMode) {
      if (options.previousPrompt) {
        lines.push(`Original prompt: ${options.previousPrompt}`);
      }
      lines.push(
        "Generate a clear visual variation that is not identical to the source image.",
      );
    }

    return lines.join("\n\n");
  }

  private isBlockedIpAddress(ipAddress: string): boolean {
    if (!ipAddress) return true;
    const normalized = ipAddress.toLowerCase();

    if (normalized === "::1") return true;

    if (normalized.includes(":")) {
      if (normalized.startsWith("fc") || normalized.startsWith("fd"))
        return true;
      if (normalized.startsWith("fe80")) return true;
      if (normalized === "::") return true;
      return false;
    }

    const parts = normalized.split(".").map((part) => Number(part));
    if (
      parts.length !== 4 ||
      parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)
    ) {
      return true;
    }

    if (parts[0] === 127) return true;
    if (parts[0] === 10) return true;
    if (parts[0] === 0) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] >= 224) return true;
    return false;
  }

  private async parseDownloadUrl(rawUrl: string): Promise<URL> {
    const trimmed = String(rawUrl || "").trim();
    if (!trimmed) {
      throw new BadRequestException("Image URL is required.");
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new BadRequestException("Invalid image URL.");
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new BadRequestException(
        "Only http/https image URLs are supported.",
      );
    }

    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "localhost") {
      throw new BadRequestException("Local image URLs are not allowed.");
    }

    if (isIP(hostname) && this.isBlockedIpAddress(hostname)) {
      throw new BadRequestException(
        "Private or local IP ranges are not allowed.",
      );
    }

    let resolvedAddresses: string[] = [];
    try {
      const resolved = await lookup(hostname, { all: true, verbatim: true });
      resolvedAddresses = resolved.map((entry) => entry.address);
    } catch {
      throw new BadRequestException("Unable to resolve image host.");
    }

    if (!resolvedAddresses.length) {
      throw new BadRequestException("Unable to resolve image host.");
    }

    for (const address of resolvedAddresses) {
      if (this.isBlockedIpAddress(address)) {
        throw new BadRequestException(
          "Private or local IP ranges are not allowed.",
        );
      }
    }

    return parsed;
  }

  private inferImageExtension(contentType: string, pathname: string): string {
    const normalizedType = contentType.toLowerCase();

    if (
      normalizedType.includes("image/jpeg") ||
      normalizedType.includes("image/jpg")
    ) {
      return "jpeg";
    }

    if (normalizedType.includes("image/png")) {
      return "png";
    }

    if (normalizedType.includes("image/webp")) {
      return "webp";
    }

    if (normalizedType.includes("image/gif")) {
      return "gif";
    }

    const normalizedPath = pathname.toLowerCase();
    if (normalizedPath.endsWith(".jpg") || normalizedPath.endsWith(".jpeg")) {
      return "jpeg";
    }

    if (normalizedPath.endsWith(".webp")) {
      return "webp";
    }

    if (normalizedPath.endsWith(".gif")) {
      return "gif";
    }

    return "png";
  }

  private inferImageContentType(
    rawContentType: string,
    extension: string,
  ): string {
    const normalizedType = rawContentType.toLowerCase().split(";")[0].trim();
    if (normalizedType.startsWith("image/")) {
      return normalizedType;
    }

    if (extension === "jpeg") return "image/jpeg";
    if (extension === "webp") return "image/webp";
    if (extension === "gif") return "image/gif";
    return "image/png";
  }

  private enforceImageRateLimit(userId: string) {
    const now = Date.now();
    const history = this.rateLimitStore.get(userId) || [];
    const validHistory = history.filter(
      (timestamp) => now - timestamp < this.imageRateWindowMs,
    );

    if (validHistory.length >= this.imageRateLimitPerWindow) {
      throw new HttpException(
        "Image generation rate limit exceeded. Please try again shortly.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    validHistory.push(now);
    this.rateLimitStore.set(userId, validHistory);
  }

  private createVariationSeed(): number {
    return Math.floor(Date.now() + Math.random() * 1000000);
  }

  private sanitizeFileSegment(input: string): string {
    return String(input || "")
      .replace(/[^a-zA-Z0-9-_:.]/g, "-")
      .slice(0, 80);
  }

  private decodeDataImage(
    imageValue: string,
  ): { buffer: Buffer; extension: string } | null {
    const match = imageValue.match(
      /^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/,
    );
    if (!match) return null;
    const extension =
      match[1]
        .replace("jpeg", "jpg")
        .replace(/[^a-z0-9]/gi, "")
        .toLowerCase() || "png";
    const buffer = Buffer.from(match[2], "base64");
    if (!buffer.length) return null;
    return { buffer, extension };
  }

  private async storeImageAsFile(imageValue: string): Promise<string | null> {
    if (this.imageStorageMode !== "local") {
      return null;
    }

    const publicBaseUrl = this.imageStoragePublicBaseUrl;
    if (!publicBaseUrl) {
      this.logger.warn(
        "IMAGE_STORAGE_MODE is local but IMAGE_STORAGE_PUBLIC_BASE_URL is missing.",
      );
      return null;
    }

    let buffer: Buffer | null = null;
    let extension = "png";

    const decodedData = this.decodeDataImage(imageValue);
    if (decodedData) {
      buffer = decodedData.buffer;
      extension = decodedData.extension;
    } else if (
      imageValue.startsWith("http://") ||
      imageValue.startsWith("https://")
    ) {
      try {
        const response = await axios.get<ArrayBuffer>(imageValue, {
          responseType: "arraybuffer",
          timeout: 15000,
          maxContentLength: 10 * 1024 * 1024,
        });
        buffer = Buffer.from(response.data);
        extension = this.inferImageExtension(
          String(response.headers["content-type"] || ""),
          new URL(imageValue).pathname,
        );
      } catch (error: any) {
        this.logger.warn(
          `Failed to persist image URL to local storage: ${error?.message || "Unknown error"}`,
        );
      }
    }

    if (!buffer || !buffer.length) {
      return null;
    }

    await mkdir(this.imageStorageDir, { recursive: true });
    const fileName = `${this.sanitizeFileSegment(Date.now().toString())}-${randomUUID()}.${extension}`;
    const filePath = join(this.imageStorageDir, fileName);
    await writeFile(filePath, buffer);
    return `${publicBaseUrl.replace(/\/$/, "")}/${fileName}`;
  }

  private async normalizeGeneratedImages(images: string[]): Promise<string[]> {
    if (!Array.isArray(images) || images.length === 0) return [];

    const result: string[] = [];
    for (const image of images) {
      const stored = await this.storeImageAsFile(image);
      result.push(stored || image);
    }
    return result;
  }

  private async getImageFingerprint(imageValue: string): Promise<string> {
    if (imageValue.startsWith("data:image/")) {
      const data = this.decodeDataImage(imageValue);
      if (!data) return createHash("sha256").update(imageValue).digest("hex");
      return createHash("sha256").update(data.buffer).digest("hex");
    }

    if (imageValue.startsWith("http://") || imageValue.startsWith("https://")) {
      try {
        const response = await axios.get<ArrayBuffer>(imageValue, {
          responseType: "arraybuffer",
          timeout: 10000,
          maxContentLength: 5 * 1024 * 1024,
        });
        return createHash("sha256")
          .update(Buffer.from(response.data))
          .digest("hex");
      } catch {
        return createHash("sha256").update(imageValue).digest("hex");
      }
    }

    return createHash("sha256").update(imageValue).digest("hex");
  }

  private async allImagesMatchSource(
    images: string[],
    previousImage: string | null,
  ): Promise<boolean> {
    if (!previousImage || !images.length) return false;
    const sourceFingerprint = await this.getImageFingerprint(previousImage);
    const fingerprints = await Promise.all(
      images.map((image) => this.getImageFingerprint(image)),
    );
    return fingerprints.every(
      (fingerprint) => fingerprint === sourceFingerprint,
    );
  }

  private async createImageVersionRecord(
    userId: string,
    sourceContentId: string,
    payload: {
      prompt: string;
      generatedImage: string | null;
      platform?: string | null;
      metadata?: Record<string, unknown>;
    },
  ): Promise<{ id: string; version: number }> {
    const source = await this.contentRepository.findOne({
      where: { id: sourceContentId, userId },
    });

    if (!source) {
      throw new HttpException(
        "Source content not found for versioning.",
        HttpStatus.NOT_FOUND,
      );
    }

    const rootSourceId = source.sourceContentId || source.id;
    const allVersions = await this.contentRepository.find({
      where: [
        { id: rootSourceId, userId },
        { sourceContentId: rootSourceId, userId },
      ],
    });
    const maxVersion = allVersions.reduce(
      (max, row) => Math.max(max, row.version || 1),
      1,
    );
    const nextVersion = maxVersion + 1;

    const versionedRow = this.contentRepository.create({
      userId,
      type: source.type,
      prompt: payload.prompt,
      generatedText: source.generatedText,
      generatedImage: payload.generatedImage,
      generatedVideo: source.generatedVideo,
      platform: payload.platform ?? source.platform,
      status: source.status || "draft",
      brandId: source.brandId,
      metadata: {
        ...(source.metadata || {}),
        ...(payload.metadata || {}),
      },
      sourceContentId: rootSourceId,
      version: nextVersion,
    });

    const created = await this.contentRepository.save(versionedRow);
    return { id: created.id, version: nextVersion };
  }

  async downloadImage(imageUrl: string) {
    const parsedUrl = await this.parseDownloadUrl(imageUrl);

    try {
      const response = await axios.get<ArrayBuffer>(parsedUrl.toString(), {
        responseType: "arraybuffer",
        timeout: 15000,
        maxRedirects: 4,
        headers: {
          Accept: "image/*",
        },
      });

      const rawContentType = String(response.headers["content-type"] || "");
      const extension = this.inferImageExtension(
        rawContentType,
        parsedUrl.pathname,
      );
      const contentType = this.inferImageContentType(rawContentType, extension);
      const buffer = Buffer.from(response.data);

      if (!buffer.length) {
        throw new HttpException(
          "Downloaded image is empty.",
          HttpStatus.BAD_GATEWAY,
        );
      }

      return {
        buffer,
        contentType,
        fileName: `generated-image-${Date.now()}.${extension}`,
      };
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }

      if (error?.response?.status === 404) {
        throw new HttpException(
          "Image not found at source URL.",
          HttpStatus.BAD_GATEWAY,
        );
      }

      throw new HttpException(
        `Failed to download image from source: ${error?.message || "Unknown error"}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async generateImage(userId: string, dto: GenerateImageDto) {
    this.enforceImageRateLimit(userId);
    const prompt = this.normalizePrompt(dto.prompt);
    const style = this.normalizeStyle(dto.style);
    const variations = this.normalizeVariations(dto.variations);
    const aspectRatio = this.normalizeAspectRatio(dto.aspectRatio);
    const promptToSend = this.buildImagePrompt(prompt, {
      style,
      aspectRatio,
    });

    try {
      const generatedImages = await this.aiService.generateImages(
        promptToSend,
        {
          model: dto.model,
          style: style || undefined,
          variations,
          aspectRatio: aspectRatio || undefined,
          seed: this.createVariationSeed(),
        },
      );

      const images = await this.normalizeGeneratedImages(generatedImages);

      if (!images.length) {
        throw new HttpException(
          "Image generation returned no images.",
          HttpStatus.BAD_GATEWAY,
        );
      }

      return {
        success: true,
        images,
        meta: {
          prompt,
          style,
          variations,
          aspectRatio,
          model: dto.model || null,
        },
      };
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        `Image generation failed: ${error?.message || "Unknown error"}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async editImage(userId: string, dto: EditImageDto) {
    this.enforceImageRateLimit(userId);
    const prompt = this.normalizePrompt(dto.prompt);
    const style = this.normalizeStyle(dto.style);
    const variations = this.normalizeVariations(dto.variations);
    const aspectRatio = this.normalizeAspectRatio(dto.aspectRatio);
    const previousPrompt = dto.previousPrompt
      ? this.normalizePrompt(dto.previousPrompt)
      : null;
    const previousImage = dto.previousImage?.trim() || null;

    const promptToSend = this.buildImagePrompt(prompt, {
      style,
      aspectRatio,
      editMode: true,
      previousPrompt,
    });

    if (!previousImage) {
      this.logger.warn(
        `Image edit called without previousImage for user ${userId}. Falling back to prompt-only variation mode.`,
      );
    }

    try {
      let duplicateDetected = false;
      let images: string[] = [];
      let retriesUsed = 0;
      const maxRetries = Math.max(0, this.imageEditMaxRetries);

      while (retriesUsed <= maxRetries) {
        const seed = this.createVariationSeed();
        const retryPrompt =
          retriesUsed === 0
            ? `${promptToSend}\n\nVariation seed: ${seed}. Produce a meaningfully different composition and framing.`
            : `${promptToSend}\n\nRetry seed: ${seed}. Ensure the output is not visually identical to the previous image. Change framing, camera angle, and lighting direction.`;

        const generatedImages = await this.aiService.generateImages(
          retryPrompt,
          {
            model: dto.model,
            style: style || undefined,
            variations,
            aspectRatio: aspectRatio || undefined,
            referenceImage: previousImage || undefined,
            editMode: true,
            seed,
          },
        );

        images = await this.normalizeGeneratedImages(generatedImages);
        if (!images.length) {
          throw new HttpException(
            "Image edit returned no images.",
            HttpStatus.BAD_GATEWAY,
          );
        }

        if (!previousImage) {
          break;
        }

        const duplicateBatch = await this.allImagesMatchSource(
          images,
          previousImage,
        );
        duplicateDetected = duplicateBatch;
        if (!duplicateBatch) {
          break;
        }
        retriesUsed += 1;
      }

      if (previousImage && duplicateDetected) {
        throw new HttpException(
          "Unable to generate a different image, please modify prompt.",
          HttpStatus.BAD_GATEWAY,
        );
      }

      let versionRecord: { id: string; version: number } | null = null;
      if (dto.persistVersion === true && dto.sourceContentId) {
        versionRecord = await this.createImageVersionRecord(
          userId,
          dto.sourceContentId,
          {
            prompt,
            generatedImage: images[0] || null,
            metadata: {
              style,
              variations,
              aspectRatio,
              allImages: images,
              previousPrompt,
              sourceImage: previousImage,
            },
          },
        );
      }

      return {
        success: true,
        images,
        meta: {
          prompt,
          style,
          variations,
          aspectRatio,
          model: dto.model || null,
          previousPrompt,
          sourceImage: previousImage,
          duplicateDetected,
          retriesUsed,
          sourceContentId: dto.sourceContentId || null,
          version: versionRecord?.version || null,
          versionContentId: versionRecord?.id || null,
        },
      };
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        `Image edit failed: ${error?.message || "Unknown error"}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async generateContent(userId: string, dto: GenerateContentDto) {
    let generatedText = null;
    let generatedImage = null;
    let generatedImages: string[] = [];
    let generatedVideo = null;
    let imageMeta: {
      prompt: string;
      style: string | null;
      variations: number;
      aspectRatio: string | null;
    } | null = null;

    // Fetch brand info if brandId is provided
    let brandName = "";
    if (dto.brandId) {
      const brand = await this.brandRepository.findOne({
        where: { id: dto.brandId, userId },
      });
      if (brand) {
        brandName = brand.name;
      }
    }

    try {
      if (dto.type === "text") {
        const textType = dto.textType || "caption";

        const rulesLines: string[] = [
          "You are writing social media content only. Do not repeat any of these instructions.",
          "Build caption/hashtags/long-post based on the given platform and text type.",
          "Use short, clean, direct language in a natural, conversational tone.",
          "Keep it platform-appropriate and add emojis only if they enhance the content.",
        ];

        if (textType === "caption") {
          rulesLines.push(
            "Write a single Instagram caption, maximum 2 short sentences (no more than about 35 words in total).",
          );
          rulesLines.push(
            "After the caption, add 2–4 relevant hashtags on one or two lines.",
          );
        } else if (textType === "hashtags") {
          const platform = dto.platform.toLowerCase();
          let count = "7–10";
          if (platform === "instagram") count = "15–30";
          if (platform === "linkedin") count = "3–5";
          if (platform === "twitter" || platform === "x") count = "2–3";

          rulesLines.push(
            `Provide ONLY ${count} highly relevant hashtags, separated by spaces.`,
          );
          rulesLines.push(
            "Do NOT include numbers, bullet points, or any sentences.",
          );
          rulesLines.push("Each hashtag MUST start with the # symbol.");
          rulesLines.push(
            "Ensure the hashtags are a mix of broad, niche, and brand-relevant tags.",
          );
        } else if (textType === "long-post") {
          rulesLines.push(
            "Write 2–3 short paragraphs suitable for a social media long post (keep each paragraph concise).",
          );
          rulesLines.push(
            "After the paragraphs, add 3–5 relevant hashtags at the end.",
          );
        }

        rulesLines.push("Do NOT explain anything.");
        rulesLines.push("Do NOT restate these rules in the output.");
        rulesLines.push(
          "Output only the final content (caption/hashtags/post) without any extra commentary or headings.",
        );

        let finalPrompt = `${rulesLines.join("\n")}
\nUser brief:\n${dto.prompt}\nPlatform: ${dto.platform}\nText type: ${textType}`;

        if (brandName) {
          finalPrompt = `Brand Name: ${brandName}\n${finalPrompt}`;
        }

        // If frontend sends 'llama', fall back to the default HF text model
        // configured inside AIService (generateText with model = undefined).
        const modelForText = dto.model === "llama" ? undefined : dto.model;

        generatedText = await this.aiService.generateText(
          finalPrompt,
          modelForText,
          150,
        );

        // Optimization: Clean up hashtag output if it's strictly a hashtag request
        if (textType === "hashtags" && generatedText) {
          generatedText = this.cleanHashtags(generatedText);
        }
      } else if (dto.type === "image") {
        this.enforceImageRateLimit(userId);
        const hasOverlay = dto.textOverlay === true;

        const cleanedPrompt = this.normalizePrompt(dto.prompt);
        const style = this.normalizeStyle(dto.style);
        const variations = this.normalizeVariations(dto.variations);
        const aspectRatio = this.normalizeAspectRatio(dto.aspectRatio);
        const promptToSend = this.buildImagePrompt(cleanedPrompt, {
          style,
          aspectRatio,
          overlayText: hasOverlay && dto.overlayText ? dto.overlayText : null,
        });

        const rawGeneratedImages = await this.aiService.generateImages(
          promptToSend,
          {
            model: dto.model,
            style: style || undefined,
            variations,
            aspectRatio: aspectRatio || undefined,
            seed: this.createVariationSeed(),
          },
        );
        generatedImages =
          await this.normalizeGeneratedImages(rawGeneratedImages);
        generatedImage = generatedImages[0] || null;
        imageMeta = {
          prompt: cleanedPrompt,
          style,
          variations,
          aspectRatio,
        };
      } else if (dto.type === "video") {
        let durationSeconds: number | undefined = undefined;

        if (dto.duration) {
          const trimmed = String(dto.duration).trim().toLowerCase();
          if (trimmed.endsWith("s")) {
            const value = parseInt(trimmed.replace("s", ""), 10);
            if (!isNaN(value) && value > 0) {
              durationSeconds = value;
            }
          }
        }

        generatedVideo = await this.aiService.generateTextToVideo(
          dto.prompt,
          durationSeconds,
        );
      } else if (dto.type === 'image') {
        // Use real AI for image generation
        // All image models (gpt-image-1, dalle-3, gemini-imagen) use the same API endpoint
        generatedImage = await this.aiService.generateImage(dto.prompt, '1024x1024', dto.model);
      }
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }

      // Re-throw error with better message; no fallback content for any type
      console.error("AI Generation failed:", {
        type: dto.type,
        error: error.message,
        statusCode: error.status || error.response?.status,
      });

      if (dto.type === "image") {
        throw new HttpException(
          `Image generation failed: ${error.message || "Unknown error"}`,
          HttpStatus.BAD_GATEWAY,
        );
      }

      if (dto.type === "text") {
        throw new HttpException(
          `Text generation failed: ${error.message || "Unknown error"}`,
          HttpStatus.BAD_GATEWAY,
        );
      }

      if (dto.type === "video") {
        throw new HttpException(
          `Video generation failed: ${error.message || "Unknown error"}`,
          HttpStatus.BAD_GATEWAY,
        );
      }
    }

    if (dto.type === "image") {
      return {
        success: true,
        images: generatedImages,
        meta: imageMeta || {
          prompt: this.normalizePrompt(dto.prompt),
          style: null,
          variations: 1,
          aspectRatio: null,
        },
        // Backward-compatible fields used by existing UI
        userId,
        type: dto.type,
        prompt: dto.prompt,
        generatedImage,
        platform: dto.platform,
        brandId: dto.brandId,
        output: generatedImage,
      };
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
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
      .map((p) => {
        // Remove any non-alphanumeric characters except #
        let cleaned = p.replace(/[^a-zA-Z0-9#_]/g, "");
        // Ensure it starts with #
        if (cleaned && !cleaned.startsWith("#")) {
          cleaned = "#" + cleaned;
        }
        return cleaned;
      })
      .filter((p) => p.length > 1); // Ignore empty or single #

    // 3. Remove duplicates
    const uniqueHashtags = [...new Set(hashtags)];

    return uniqueHashtags.join(" ");
  }

  private normalizeComparableValue(value?: string | null): string {
    return String(value || "").trim();
  }

  private normalizeMetadataForComparison(metadata?: any): string {
    if (!metadata || typeof metadata !== "object") {
      return "";
    }
    return JSON.stringify(metadata);
  }

  private isWithinDedupeWindow(createdAt?: Date | null): boolean {
    if (!createdAt) return false;
    return Date.now() - new Date(createdAt).getTime() <= this.saveDedupeWindowMs;
  }

  private parseScheduledAt(scheduledAtInput: string | Date): Date {
    if (
      typeof scheduledAtInput === "string" &&
      !/(Z|[+-]\d{2}:\d{2})$/.test(scheduledAtInput.trim())
    ) {
      throw new BadRequestException(
        "scheduledAt must include timezone (Z or +/-HH:MM).",
      );
    }
    const scheduledAt = new Date(scheduledAtInput);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException("Invalid scheduledAt timestamp.");
    }
    if (scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException("scheduledAt must be a future time.");
    }
    return scheduledAt;
  }

  async saveContent(userId: string, dto: SaveContentDto) {
    const normalizedPrompt = this.normalizeComparableValue(dto.prompt);
    const normalizedText = this.normalizeComparableValue(dto.generatedText);
    const normalizedImage = this.normalizeComparableValue(dto.generatedImage);
    const normalizedVideo = this.normalizeComparableValue(dto.generatedVideo);
    const normalizedPlatform = this.normalizeComparableValue(dto.platform).toLowerCase();
    const normalizedStatus = this.normalizeComparableValue(dto.status || "draft").toLowerCase();
    const normalizedMetadata = this.normalizeMetadataForComparison(dto.metadata);

    const latestSimilar = await this.contentRepository.findOne({
      where: {
        userId,
        type: dto.type,
      },
      order: { createdAt: "DESC" },
    });

    if (
      latestSimilar &&
      this.isWithinDedupeWindow(latestSimilar.createdAt) &&
      this.normalizeComparableValue(latestSimilar.prompt) === normalizedPrompt &&
      this.normalizeComparableValue(latestSimilar.generatedText) === normalizedText &&
      this.normalizeComparableValue(latestSimilar.generatedImage) === normalizedImage &&
      this.normalizeComparableValue(latestSimilar.generatedVideo) === normalizedVideo &&
      this.normalizeComparableValue(latestSimilar.platform).toLowerCase() === normalizedPlatform &&
      this.normalizeComparableValue(latestSimilar.status || "draft").toLowerCase() === normalizedStatus &&
      this.normalizeComparableValue(latestSimilar.brandId) === this.normalizeComparableValue(dto.brandId) &&
      this.normalizeMetadataForComparison(latestSimilar.metadata) === normalizedMetadata
    ) {
      return latestSimilar;
    }

    const content = this.contentRepository.create({
      userId,
      type: dto.type,
      prompt: dto.prompt,
      generatedText: dto.generatedText,
      generatedImage: dto.generatedImage,
      generatedVideo: dto.generatedVideo,
      platform: dto.platform,
      status: dto.status || "draft",
      brandId: dto.brandId,
      tags: dto.tags ?? undefined,
      metadata: dto.metadata,
    });

    return this.contentRepository.save(content);
  }

  async updateContent(
    userId: string,
    contentId: string,
    dto: UpdateContentDto,
  ) {
    const existing = await this.contentRepository.findOne({
      where: { id: contentId, userId },
    });

    if (!existing) {
      throw new HttpException("Content not found.", HttpStatus.NOT_FOUND);
    }

    if (dto.createVersion === true) {
      const rootSourceId = existing.sourceContentId || existing.id;

      const normalizedPrompt = this.normalizeComparableValue(dto.prompt ?? existing.prompt);
      const normalizedText = this.normalizeComparableValue(dto.generatedText ?? existing.generatedText);
      const normalizedImage = this.normalizeComparableValue(dto.generatedImage ?? existing.generatedImage);
      const normalizedVideo = this.normalizeComparableValue(dto.generatedVideo ?? existing.generatedVideo);
      const normalizedPlatform = this.normalizeComparableValue(dto.platform ?? existing.platform).toLowerCase();
      const normalizedStatus = this.normalizeComparableValue(dto.status ?? existing.status ?? "draft").toLowerCase();
      const normalizedMetadata = this.normalizeMetadataForComparison(dto.metadata ?? existing.metadata);

      const allVersions = await this.contentRepository.find({
        where: [
          { id: rootSourceId, userId },
          { sourceContentId: rootSourceId, userId },
        ],
      });
      const maxVersion = allVersions.reduce(
        (max, row) => Math.max(max, row.version || 1),
        1,
      );

      const latestVersion = allVersions
        .slice()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

      if (
        latestVersion &&
        this.isWithinDedupeWindow(latestVersion.createdAt) &&
        this.normalizeComparableValue(latestVersion.prompt) === normalizedPrompt &&
        this.normalizeComparableValue(latestVersion.generatedText) === normalizedText &&
        this.normalizeComparableValue(latestVersion.generatedImage) === normalizedImage &&
        this.normalizeComparableValue(latestVersion.generatedVideo) === normalizedVideo &&
        this.normalizeComparableValue(latestVersion.platform).toLowerCase() === normalizedPlatform &&
        this.normalizeComparableValue(latestVersion.status || "draft").toLowerCase() === normalizedStatus &&
        this.normalizeMetadataForComparison(latestVersion.metadata) === normalizedMetadata
      ) {
        return latestVersion;
      }

      const versionedRow = this.contentRepository.create({
        userId,
        type: existing.type,
        prompt: dto.prompt ?? existing.prompt,
        generatedText: dto.generatedText ?? existing.generatedText,
        generatedImage: dto.generatedImage ?? existing.generatedImage,
        generatedVideo: dto.generatedVideo ?? existing.generatedVideo,
        platform: dto.platform ?? existing.platform,
        status: dto.status ?? existing.status ?? "draft",
        brandId: dto.brandId ?? existing.brandId,
        tags: dto.tags ?? existing.tags,
        metadata: dto.metadata ?? existing.metadata,
        sourceContentId: dto.sourceContentId ?? rootSourceId,
        version: dto.version ?? maxVersion + 1,
      });

      return this.contentRepository.save(versionedRow);
    }

    await this.contentRepository.update(
      { id: contentId, userId },
      {
        prompt: dto.prompt ?? existing.prompt,
        generatedText: dto.generatedText ?? existing.generatedText,
        generatedImage: dto.generatedImage ?? existing.generatedImage,
        generatedVideo: dto.generatedVideo ?? existing.generatedVideo,
        platform: dto.platform ?? existing.platform,
        status: dto.status ?? existing.status,
        brandId: dto.brandId ?? existing.brandId,
        tags: dto.tags ?? existing.tags,
        metadata: dto.metadata ?? existing.metadata,
        sourceContentId: dto.sourceContentId ?? existing.sourceContentId,
        version: dto.version ?? existing.version ?? 1,
      },
    );

    return this.getContentById(userId, contentId);
  }

  async getContent(
    userId: string,
    options: {
      filter?: string;
      q?: string;
      tag?: string;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(Math.max(1, Number(options.limit) || 20), 100);
    const skip = (page - 1) * limit;

    const qb = this.contentRepository
      .createQueryBuilder("content")
      .leftJoinAndSelect("content.brand", "brand")
      .leftJoinAndSelect("content.analytics", "analytics")
      .where("content.userId = :userId", { userId });

    // Status filter
    if (options.filter && options.filter !== "all") {
      qb.andWhere("content.status = :status", { status: options.filter });
    }

    // Full-text search across prompt and generated text
    if (options.q?.trim()) {
      const search = `%${options.q.trim().toLowerCase()}%`;
      qb.andWhere(
        "(LOWER(content.prompt) LIKE :search OR LOWER(content.generatedText) LIKE :search)",
        { search },
      );
    }

    // Tag filter — simple-array stores comma-separated values
    if (options.tag?.trim()) {
      qb.andWhere("content.tags LIKE :tag", {
        tag: `%${options.tag.trim()}%`,
      });
    }

    qb.orderBy("content.createdAt", "DESC").skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getContentById(userId: string, contentId: string) {
    return this.contentRepository.findOne({
      where: { id: contentId, userId },
      relations: ["brand", "analytics"],
    });
  }

  async deleteContent(userId: string, contentId: string) {
    const existing = await this.contentRepository.findOne({
      where: { id: contentId, userId },
    });

    if (!existing) {
      throw new HttpException("Content not found.", HttpStatus.NOT_FOUND);
    }

    // Soft delete: sets deleted_at timestamp, preserves analytics data
    await this.contentRepository.softDelete({ id: contentId, userId });
    return { message: "Content deleted successfully." };
  }

  async scheduleContent(
    userId: string,
    contentId: string,
    scheduledAtInput: string | Date,
  ) {
    const content = await this.getContentById(userId, contentId);
    if (!content) {
      throw new HttpException("Content not found.", HttpStatus.NOT_FOUND);
    }

    if (content.status?.toLowerCase() === "published") {
      throw new BadRequestException(
        "Published content cannot be scheduled again.",
      );
    }

    // Pre-flight: every scheduled post must have a target platform
    if (!content.platform) {
      throw new BadRequestException(
        "Content must have a platform set before scheduling. " +
        "Please specify a platform (e.g. facebook, instagram) and try again.",
      );
    }

    // Pre-flight: the user must have a connected + active account for that platform
    const hasAccount = await this.socialService.hasActiveAccount(
      userId,
      content.platform,
    );
    if (!hasAccount) {
      throw new BadRequestException(
        `You don't have a connected ${content.platform} account. ` +
        `Please go to Settings → Social Accounts, connect your ${content.platform} account, ` +
        "and then try scheduling again.",
      );
    }

    const scheduledAt = this.parseScheduledAt(scheduledAtInput);
    await this.contentRepository.update(
      { id: contentId, userId },
      {
        status: "scheduled",
        scheduledAt,
        publishedAt: null,
      },
    );

    return this.getContentById(userId, contentId);
  }

  async cancelSchedule(userId: string, contentId: string) {
    const content = await this.getContentById(userId, contentId);
    if (!content) {
      throw new HttpException("Content not found.", HttpStatus.NOT_FOUND);
    }

    // Reject cancellation if the scheduler has already claimed this item and
    // is actively publishing it — the platform call may be in-flight and
    // cannot be undone. The status will transition to 'published' or 'failed'.
    if (content.status === "publishing") {
      throw new BadRequestException(
        "Content is currently being published and cannot be cancelled. " +
        "Please wait for the publish to complete.",
      );
    }

    // Conditional WHERE ensures this is a no-op if the scheduler claimed the
    // item (status → 'publishing') between the read above and this write.
    await this.contentRepository.update(
      { id: contentId, userId, status: "scheduled" },
      {
        status: "draft",
        scheduledAt: null,
      },
    );

    return this.getContentById(userId, contentId);
  }

  async getDashboardStats(userId: string) {
    // Load user content once so status counting is consistent with Recent Content
    const allContent = await this.contentRepository.find({
      where: { userId },
      relations: ["brand", "analytics"],
      order: { createdAt: "DESC" },
    });

    const totalContent = allContent.length;
    const draftedContent = allContent.filter(
      (c) => c.status?.toLowerCase() === "draft",
    ).length;
    const scheduledContent = allContent.filter(
      (c) => c.status?.toLowerCase() === "scheduled",
    ).length;
    const publishedContent = allContent.filter(
      (c) => c.status?.toLowerCase() === "published",
    ).length;

    // Recent content: last 5 by createdAt
    const recentContent = allContent.slice(0, 5);

    // Calculate analytics totals (mock data for now)
    const totalViews = recentContent.reduce((sum, content) => {
      return (
        sum +
        (content.analytics?.reduce(
          (acc, analytic) => acc + (analytic.views || 0),
          0,
        ) || 0)
      );
    }, 0);

    const totalLikes = recentContent.reduce((sum, content) => {
      return (
        sum +
        (content.analytics?.reduce(
          (acc, analytic) => acc + (analytic.likes || 0),
          0,
        ) || 0)
      );
    }, 0);

    const totalShares = recentContent.reduce((sum, content) => {
      return (
        sum +
        (content.analytics?.reduce(
          (acc, analytic) => acc + (analytic.shares || 0),
          0,
        ) || 0)
      );
    }, 0);

    return {
      totalContent,
      draftedContent,
      scheduledContent,
      publishedContent,
      totalViews,
      totalLikes,
      totalShares,
      recentContent,
    };
  }
}
