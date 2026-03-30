import { IsEmail, IsString, Matches, MinLength, IsOptional } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @Matches(/\d/)
  @Matches(/[^A-Za-z0-9]/)
  password: string;

  @IsString()
  fullName: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  role?: string;
}
