import { IsEmail, IsIn, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;

  @IsOptional()
  @IsIn(['merchant', 'admin'])
  role?: 'merchant' | 'admin';
}
