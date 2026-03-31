import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

/**
 * Gemini (AI Studio) helper focused on prompt-building and vision-based prompt extraction.
 *
 * Why: Gemini API access is reliable for text+vision. Image/video generation endpoints vary by project.
 * We use Gemini to: (1) improve prompts, (2) generate prompts from first/last frames when missing.
 */
@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly apiKey: string | undefined;
  private readonly model: string;

  constructor(private configService: ConfigService) {
    // Support both names so existing envs keep working.
    this.apiKey =
      this.configService.get<string>('GEMINI_API_KEY') ||
      this.configService.get<string>('GOOGLE_API_KEY');
    // Default to a widely-available, cheaper model for free-tier usage.
    this.model = this.configService.get<string>('GEMINI_MODEL') || 'gemini-flash-latest';
  }

  isConfigured() {
    return !!this.apiKey;
  }

  /**
   * Generate a short, high-signal prompt for video generation using first/last frames.
   */
  async promptFromFirstLastFrames(params: {
    firstFrame: string;
    lastFrame: string;
    platform?: string;
  }): Promise<string> {
    const { firstFrame, lastFrame, platform } = params;

    const first = await this.toInlineData(firstFrame);
    const last = await this.toInlineData(lastFrame);

    const sys = [
      'You write prompts for a text-to-video model.',
      'Goal: describe a smooth, realistic transition from the first frame to the last frame.',
      'Be concise but specific: setting, subject, camera motion, lighting, mood, and actions.',
      'Do not mention "first frame" or "last frame". Do not add extra commentary.',
      platform ? `Platform: ${platform}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const content = await this.generateContent({
      system: sys,
      parts: [
        { text: 'Create a single prompt for a short video transition.' },
        { inlineData: first },
        { inlineData: last },
      ],
    });

    return content.trim();
  }

  /**
   * Describe an input image (vision) so we can do "image → image" using a text-to-image generator.
   *
   * Why: our current image generator is text-to-image. This bridges the gap so Image→Image is usable
   * immediately while keeping the architecture provider-based.
   */
  async describeImage(params: { image: string }): Promise<string> {
    const img = await this.toInlineData(params.image);
    const sys = [
      'Describe the image for a creative generation prompt.',
      'Be specific: subject, setting, composition, colors, lighting, style, and mood.',
      'Return ONE concise paragraph. No bullet points. No preamble.',
    ].join('\n');

    const content = await this.generateContent({
      system: sys,
      parts: [{ inlineData: img }],
    });

    return content.trim();
  }

  /**
   * Generate a minimal UGC pack (structured) from a product/brand brief.
   *
   * Why: management requires UGC creation in Priority 1, starting with OSS + layering subscription later.
   * This provides a usable first version driven by Gemini text output.
   */
  async ugcPack(params: { brief: string; platform?: string }): Promise<{
    hooks: string[];
    captions: string[];
    hashtags: string[];
    shotlist: string[];
  }> {
    const sys = [
      'You create UGC packs for social media creators.',
      'Return VALID JSON only. No markdown. No commentary.',
      'JSON shape: {"hooks": string[], "captions": string[], "hashtags": string[], "shotlist": string[]}.',
      'hooks: 5 short hook lines.',
      'captions: 3 captions (1–2 sentences each).',
      'hashtags: 10 relevant hashtags, each starting with #.',
      'shotlist: 6 short shots/beats for filming.',
      params.platform ? `Platform: ${params.platform}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const content = await this.generateContent({
      system: sys,
      parts: [{ text: params.brief }],
    });

    try {
      const parsed = JSON.parse(content);
      return {
        hooks: Array.isArray(parsed.hooks) ? parsed.hooks : [],
        captions: Array.isArray(parsed.captions) ? parsed.captions : [],
        hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
        shotlist: Array.isArray(parsed.shotlist) ? parsed.shotlist : [],
      };
    } catch {
      // Fallback: keep raw response for debugging but still return a safe structure.
      return { hooks: [], captions: [], hashtags: [], shotlist: [] };
    }
  }

  /**
   * Expand/clean a user prompt for downstream image/video generators.
   */
  async enhancePrompt(params: {
    prompt: string;
    kind: 'image' | 'video';
    platform?: string;
  }): Promise<string> {
    const { prompt, kind, platform } = params;

    const sys = [
      `You refine prompts for ${kind} generation.`,
      'Rewrite the user prompt to be clearer and more specific.',
      'Keep it as ONE prompt (no bullet points).',
      'Do not include safety policy text or explanations.',
      platform ? `Platform: ${platform}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const content = await this.generateContent({
      system: sys,
      parts: [{ text: prompt }],
    });

    return content.trim();
  }

  private async generateContent(args: {
    system: string;
    parts: Array<
      | { text: string }
      | {
          inlineData: { mimeType: string; data: string };
        }
    >;
  }): Promise<string> {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      this.model,
    )}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const body: any = {
      contents: [
        {
          role: 'user',
          parts: [{ text: args.system }, ...args.parts],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 256,
      },
    };

    try {
      const res = await axios.post(url, body, { timeout: 60000 });
      const text =
        res.data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join('') ||
        res.data?.text;

      if (!text || typeof text !== 'string') {
        throw new Error('Empty response from Gemini');
      }

      return text;
    } catch (e: any) {
      const msg =
        e?.response?.data?.error?.message ||
        e?.response?.data?.message ||
        e?.message ||
        'Gemini request failed';
      this.logger.error(`Gemini error: ${msg}`);
      throw new Error(msg);
    }
  }

  private async toInlineData(input: string): Promise<{ mimeType: string; data: string }> {
    // Data URL: data:image/png;base64,....
    if (input.startsWith('data:')) {
      const match = input.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        throw new Error('Invalid data URL image');
      }
      return { mimeType: match[1], data: match[2] };
    }

    // Remote URL: fetch and base64 it
    if (input.startsWith('http://') || input.startsWith('https://')) {
      const res = await axios.get<ArrayBuffer>(input, { responseType: 'arraybuffer', timeout: 60000 });
      const contentType = String(res.headers?.['content-type'] || 'image/png');
      const b64 = Buffer.from(res.data as any).toString('base64');
      return { mimeType: contentType, data: b64 };
    }

    // Bare base64 (assume png)
    return { mimeType: 'image/png', data: input };
  }
}

