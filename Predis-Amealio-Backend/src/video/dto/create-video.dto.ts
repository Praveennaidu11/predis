import { Type } from 'class-transformer';
import { IsString, IsEnum, IsOptional, IsNumber, IsArray, IsIn } from 'class-validator';

export class CreateVideoDto {
  @IsString()
  prompt: string;

  @IsEnum(['text', 'image', 'multi-image', 'audio'])
  type: 'text' | 'image' | 'multi-image' | 'audio';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsString()
  audio?: string;

  @Type(() => Number)
  @IsNumber()
  @IsIn([5, 10, 15])
  duration: number; // 5, 10, 15

  @IsString()
  model: string;

  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsString()
  recipe?: string;

  @IsOptional()
  input?: any;
}
