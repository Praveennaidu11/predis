import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const KEY_PATTERN = /^[a-zA-Z0-9_.-]+$/;

export class CreateAdminSettingDto {
  @IsString()
  @MaxLength(128)
  @Matches(KEY_PATTERN, {
    message: 'key must use letters, numbers, dots, underscores, or hyphens',
  })
  key: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  value?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;

  @IsOptional()
  @IsBoolean()
  isEncrypted?: boolean;
}
