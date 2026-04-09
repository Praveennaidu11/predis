import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class RecordAnalyticsDto {
  @IsUUID()
  contentId: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  views?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  likes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  shares?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  comments?: number;
}
