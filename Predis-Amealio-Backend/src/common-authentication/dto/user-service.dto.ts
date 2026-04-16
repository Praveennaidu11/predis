import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class UserServiceCreateDto {
  @IsString()
  mobile_number: string;

  @IsString()
  country_code: string;

  @IsEmail()
  email: string;

  @IsString()
  first_name: string;

  @IsString()
  last_name: string;

  @IsBoolean()
  user_verified: boolean;

  @IsString()
  role: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  referral?: string;

  @IsString()
  deviceId: string;

  @IsString()
  deviceType: string;

  @IsString()
  deviceName: string;

  @IsString()
  deviceVersion: string;

  @IsString()
  deviceUniqId: string;

  @IsString()
  deviceSystemVersion: string;
}

