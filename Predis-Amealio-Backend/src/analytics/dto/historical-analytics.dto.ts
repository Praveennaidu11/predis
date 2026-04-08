import { IsDateString, IsOptional, IsString } from 'class-validator';

export class HistoricalAnalyticsDto {
  @IsDateString()
  from: string;

  @IsDateString()
  to: string;

  @IsOptional()
  @IsString()
  platform?: string;
}
