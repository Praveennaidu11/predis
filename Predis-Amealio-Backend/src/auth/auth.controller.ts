import { Controller, Post, Get, Body, UseGuards, Request, Res, Query } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { IsEmail, IsString, Matches, MinLength } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { GoogleAuthGuard } from './google-auth.guard';
import { FacebookAuthGuard } from './facebook-auth.guard';

class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

class ResetPasswordDto {
  @IsEmail()
  email: string;

  @IsString()
  otp: string;

  @IsString()
  @MinLength(8)
  @Matches(/\d/)
  @Matches(/[^A-Za-z0-9]/)
  password: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  /** USER SIGNUP */
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /** USER LOGIN */
  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // -------------------------------------
  // OTP ENDPOINTS REMOVED / COMMENTED OUT
  // -------------------------------------

  /*
  @Post('verify-email-otp')
  async verifyEmailOtp(@Body() body: { email: string; otp: string }) {
    return this.authService.verifyEmailOtp(body.email, body.otp);
  }

  @Post('resend-email-otp')
  async resendEmailOtp(@Body() body: { email: string }) {
    return this.authService.resendEmailOtp(body.email);
  }
  */

  /** GET LOGGED-IN USER PROFILE */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Request() req) {
    return this.authService.getProfile(req.user.userId);
  }

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  async googleAuth() {
    // redirects to Google
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(
    @Request() req,
    @Res() res: Response,
    @Query('state') state?: string,
  ) {
    const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:5000';
    try {
      const parsed = state ? JSON.parse(state) : {};
      const role = parsed?.role || 'merchant';
      const result = await this.authService.socialLogin({ ...req.user, role });
      return res.redirect(`${frontendUrl}/auth/callback?token=${encodeURIComponent(result.token)}&role=${encodeURIComponent(role)}`);
    } catch (e: any) {
      return res.redirect(`${frontendUrl}/auth/callback?error=${encodeURIComponent(e.message || 'OAuth failed')}`);
    }
  }

  @Get('facebook')
  @UseGuards(FacebookAuthGuard)
  async facebookAuth() {
    // redirects to Facebook
  }

  @Get('facebook/callback')
  @UseGuards(FacebookAuthGuard)
  async facebookCallback(
    @Request() req,
    @Res() res: Response,
    @Query('state') state?: string,
  ) {
    const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:5000';
    try {
      const parsed = state ? JSON.parse(state) : {};
      const role = parsed?.role || 'merchant';
      const result = await this.authService.socialLogin({ ...req.user, role });
      return res.redirect(`${frontendUrl}/auth/callback?token=${encodeURIComponent(result.token)}&role=${encodeURIComponent(role)}`);
    } catch (e: any) {
      return res.redirect(`${frontendUrl}/auth/callback?error=${encodeURIComponent(e.message || 'OAuth failed')}`);
    }
  }
}
