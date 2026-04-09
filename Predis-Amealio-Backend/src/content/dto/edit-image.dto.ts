import { Type } from "class-transformer";
import { IsBoolean, IsOptional, IsString } from "class-validator";
import { GenerateImageDto } from "./generate-image.dto";

export class EditImageDto extends GenerateImageDto {
  @IsOptional()
  @IsString()
  previousPrompt?: string;

  @IsOptional()
  @IsString()
  previousImage?: string;

  @IsOptional()
  @IsString()
  sourceContentId?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  persistVersion?: boolean;
}
