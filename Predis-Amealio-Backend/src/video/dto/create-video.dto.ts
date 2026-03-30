import { IsString, IsEnum, IsOptional, IsNumber, IsArray, IsIn } from 'class-validator';

export class CreateVideoDto {
  @IsString()
  prompt: string;

  @IsEnum(['text', 'image', 'multi-image'])
  type: 'text' | 'image' | 'multi-image';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsNumber()
  @IsIn([5, 10, 15])
  duration: number; // 5, 10, 15

  @IsString()
  model: string;

  @IsOptional()
  @IsString()
  platform?: string;
}
