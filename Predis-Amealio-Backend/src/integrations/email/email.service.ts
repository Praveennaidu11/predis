import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private emailTransporter: nodemailer.Transporter | null = null;
  private emailOtpStore: Record<string, { otp: string; expiresAt: number }> = {};

  constructor(private configService: ConfigService) {
    this.initializeEmailTransporter();
  }

  private initializeEmailTransporter() {
    const smtpHost = this.configService.get('SMTP_HOST');
    const smtpPort = this.configService.get('SMTP_PORT');
    const smtpUser = this.configService.get('SMTP_USER');
    const smtpPassword = this.configService.get('SMTP_PASSWORD');

    if (smtpHost && smtpPort && smtpUser && smtpPassword) {
      try {
        this.emailTransporter = nodemailer.createTransport({
          host: smtpHost,
          port: parseInt(smtpPort) || 587,
          secure: parseInt(smtpPort) === 465,
          auth: {
            user: smtpUser,
            pass: smtpPassword,
          },
        });
        this.logger.log('✅ SMTP Email transporter initialized successfully');
      } catch (error) {
        this.logger.warn('⚠️ Failed to initialize SMTP email transporter:', error.message);
        this.emailTransporter = null;
      }
    } else {
      this.logger.warn('⚠️ SMTP configuration not provided. Email OTP will be logged to console only.');
      this.emailTransporter = null;
    }
  }

  async sendEmailOTP(email: string): Promise<{ success: boolean; message: string; otp?: string }> {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiryMinutes = 2;
    const expiresAt = Date.now() + expiryMinutes * 60 * 1000;

    this.emailOtpStore[email] = { otp, expiresAt };
    
    console.log('\n' + '╔' + '═'.repeat(60) + '╗');
    console.log(`║ 🚀 [BACKEND] EMAIL OTP FOR: ${email.padEnd(34)} ║`);
    console.log(`║ 🔑 YOUR CODE IS: ${otp.padEnd(41)} ║`);
    console.log('╚' + '═'.repeat(60) + '╝' + '\n');

    if (this.emailTransporter) {
      try {
        const mailOptions = {
          from: this.configService.get('SMTP_FROM') || this.configService.get('SMTP_USER') || 'noreply@amealio.com',
          to: email, 
          subject: 'Your Amealio Verification Code',
          html: `<p>Your verification code is: <strong>${otp}</strong></p>`,
          text: `Your Amealio verification code is: ${otp}`,
        };

        await this.emailTransporter.sendMail(mailOptions);
        this.logger.log(`✅ Email OTP sent to ${email}`);
        
        return { success: true, message: 'Email OTP sent successfully' };
      } catch (error) {
        this.logger.error(`❌ Failed to send email OTP to ${email}:`, error.message);
        return { success: true, message: `OTP generated (Dev Mode): ${otp}`, otp };
      }
    } else {
      this.logger.warn(`⚠️ SMTP not configured. OTP logged to console: ${otp}`);
      return { success: true, message: `OTP generated (Dev Mode): ${otp}`, otp };
    }
  }

  async verifyEmailOTP(email: string, otp: string): Promise<boolean> {
    const record = this.emailOtpStore[email];
    if (!record) return false;
    if (Date.now() > record.expiresAt) {
      delete this.emailOtpStore[email];
      return false;
    }
    if (record.otp === otp) {
      delete this.emailOtpStore[email];
      return true;
    }
    return false;
  }
}
