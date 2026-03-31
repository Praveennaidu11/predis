import { Type } from 'class-transformer';
import {
  Allow,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const Recipes = [
  'text_to_image',
  'image_to_image',
  'text_to_video',
  'first_last_prompt_to_video',
  'first_last_to_video',
  'ugc_create',
] as const;

export type CreateGenerationRecipe = (typeof Recipes)[number];

class GenerationInputDto {
  @IsOptional()
  @IsString()
  inputImage?: string;

  @IsOptional()
  @IsString()
  firstFrame?: string;

  @IsOptional()
  @IsString()
  lastFrame?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  /**
   * Why Allow():
   * - DTOs evolve quickly and some recipes may need extra fields later.
   * - Global ValidationPipe uses forbidNonWhitelisted=true.
   */
  @Allow()
  extra?: Record<string, any>;
}

export class CreateGenerationJobDto {
  @IsEnum(Recipes as any)
  recipe: CreateGenerationRecipe;

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsString()
  provider?: string; // e.g. "gemini", "open_source"

  @IsOptional()
  @IsString()
  model?: string; // provider-specific model name (optional)

  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  duration?: number;

  /**
   * Inputs for image/video recipes.
   * - For frame-to-video: `firstFrame` and `lastFrame` as either data URL or http(s) URL
   * - For img2img: `inputImage` as data URL or http(s) URL
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => GenerationInputDto)
  input?: GenerationInputDto;

  @IsOptional()
  @IsIn(['merchant', 'admin'])
  requestedAs?: 'merchant' | 'admin';
}

