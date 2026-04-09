import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class GenerateImageDto {
  @IsString()
  prompt: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  style?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  variations?: number;

  @IsOptional()
  @IsString()
  @IsIn(["1:1", "4:5", "9:16", "16:9", "3:2", "2:3"])
  aspectRatio?: string;
}
