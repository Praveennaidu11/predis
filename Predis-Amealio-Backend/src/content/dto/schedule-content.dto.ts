import { IsDateString, Matches } from 'class-validator';

export class ScheduleContentDto {
  @IsDateString()
  @Matches(/(Z|[+-]\d{2}:\d{2})$/, {
    message:
      'scheduledAt must include a timezone designator (Z or +/-HH:MM).',
  })
  scheduledAt: string;
}
