import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class GenerateContentDto {
  @IsString()
  prompt: string;

  @IsEnum(['text', 'image', 'video'])
  type: string;

  @IsString()
  platform: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  textType?: string;

  // Optional image-related options
  @IsOptional()
  @IsString()
  aspectRatio?: string;

  @IsOptional()
  @IsBoolean()
  textOverlay?: boolean;

  @IsOptional()
  @IsString()
  overlayText?: string;

  @IsOptional()
  @IsString()
  style?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  variations?: number;

  // Optional video-related options
  @IsOptional()
  @IsString()
  videoType?: string;

  @IsOptional()
  @IsString()
  duration?: string;

  @IsOptional()
  @IsString()
  brandId?: string;
}
