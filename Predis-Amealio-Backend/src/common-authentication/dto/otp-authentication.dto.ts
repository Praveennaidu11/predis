import { IsString } from 'class-validator';

export class OtpAuthenticationRequestDto {
  @IsString()
  strategy: string;

  @IsString()
  mobile_number: string;

  @IsString()
  country_code: string;

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

