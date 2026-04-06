import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class PromptSuggestionsDto {
  @IsIn(['text', 'image', 'video'])
  type: 'text' | 'image' | 'video';

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  platform: string;

  /** User's current prompt fragment (e.g. "college fest", "generate caption") */
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  prompt: string;

  @IsOptional()
  @IsString()
  textType?: string;

  @IsOptional()
  @IsString()
  tone?: string;

  @IsOptional()
  @IsString()
  aspectRatio?: string;

  @IsOptional()
  textOverlay?: boolean | null;

  @IsOptional()
  @IsString()
  overlayText?: string;

  @IsOptional()
  @IsString()
  videoType?: string;

  @IsOptional()
  @IsString()
  duration?: string;
}
