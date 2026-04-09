import { IsOptional, IsString, MaxLength, Matches } from 'class-validator';

const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export class UpdateBrandDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  logo?: string;

  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR, { message: 'primaryColor must be a hex color like #fff or #ffffff' })
  primaryColor?: string;

  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR, { message: 'secondaryColor must be a hex color like #fff or #ffffff' })
  secondaryColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  fontFamily?: string;
}

