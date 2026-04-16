import { Body, Controller, Get, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { Request } from 'express';
import { CommonAuthenticationService } from './common-authentication.service';
import { UserServiceCreateDto } from './dto/user-service.dto';
import { OtpAuthenticationRequestDto } from './dto/otp-authentication.dto';

@Controller()
export class CommonAuthenticationController {
  constructor(private commonAuth: CommonAuthenticationService) {}

  @Post('user-service')
  async createUser(@Body() dto: UserServiceCreateDto) {
    return this.commonAuth.createUser(dto);
  }

  @Post('otp-authentication')
  async generateOtp(@Body() dto: OtpAuthenticationRequestDto) {
    return this.commonAuth.requestOtpForMobile(dto, 'register');
  }

  @Patch('otp-authentication')
  async loginRequestOtp(@Body() dto: OtpAuthenticationRequestDto) {
    return this.commonAuth.requestOtpForMobile(dto, 'login');
  }

  @Get('otp-authentication')
  async verifyOtp(
    @Query('user_id') userId: string,
    @Query('OTP') otp: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token } = await this.commonAuth.verifyOtp(userId, otp);
    res.setHeader('Authorization', `Bearer ${token}`);
    return { success: true, token };
  }

  @Get('validate-token')
  async validateToken(@Req() req: Request) {
    const auth = String(req.headers['authorization'] || '').trim();
    return this.commonAuth.validateToken(auth);
  }
}

