import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { User } from '../common/entities/user.entity';
import * as bcrypt from 'bcryptjs';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { EmailService } from '../integrations/email/email.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
    private emailService: EmailService,
    private configService: ConfigService,
  ) {}

  /**
   * USER SIGNUP
   * - Check if email exists
   * - Hash password
   * - Save user in DB
   * - Return JWT + User data
   */
  async register(dto: RegisterDto) {
    const existing = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = this.userRepository.create({
      email: dto.email,
      passwordHash: hashedPassword,
      fullName: dto.fullName,
      companyName: dto.companyName,
      role: 'merchant',
      subscriptionTier: 'free',
    });

    await this.userRepository.save(user);

    const res = await this.emailService.sendEmailOTP(user.email);
    
    return {
      message: res.message,
      email: user.email,
    };
  }

  /**
   * USER LOGIN
   * - Check if email exists → if not, ask to sign up
   * - Validate password
   * - Return JWT + user info
   */
  async login(dto: LoginDto) {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('User not found. Please sign up first.');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('This account uses OAuth login. Please sign in with Google.');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid password');
    }

    if (dto.role && user.role && dto.role !== user.role) {
      throw new UnauthorizedException(`Invalid role for this account`);
    }

    const token = this.generateToken(user.id, user.email, user.role);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        companyName: user.companyName,
        role: user.role,
      },
    };
  }

  async requestPasswordReset(email: string) {
    const user = await this.userRepository.findOne({ where: { email } });

    if (user) {
      // Reverting to simple message for now
      this.logger.log(`Password reset requested for ${email}`);
    }

    return {
      message: 'If an account exists for this email, reset instructions will be sent.',
    };
  }

  async resetPassword(email: string, otp: string, newPassword: string) {
    throw new UnauthorizedException('OTP verification is currently disabled. Please contact support.');
  }

  async verifyEmailOtp(email: string, otp: string) {
    const isValid = await this.emailService.verifyEmailOTP(email, otp);
    if (!isValid) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const token = this.generateToken(user.id, user.email, user.role);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.fullName,
        role: user.role,
      },
    };
  }

  async resendEmailOtp(email: string) {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const res = await this.emailService.sendEmailOTP(email);
    
    return {
      message: res.message,
      email,
    };
  }

  async sendMobileOtp(mobile: string) {
    throw new UnauthorizedException('Mobile signup is currently disabled.');
  }

  async resendMobileOtp(mobile: string) {
    throw new UnauthorizedException('Mobile OTP resend is currently disabled.');
  }

  async verifyMobileOtp(mobile: string, otp: string) {
    throw new UnauthorizedException('Mobile verification is currently disabled.');
  }

  /**
   * Get logged-in user's profile
   */
  async getProfile(userId: string) {
    return this.userRepository.findOne({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        subscriptionTier: true,
        credits: true,
        companyName: true,
        profileImage: true,
      },
    });
  }

  /**
   * Validate user by ID (JWT guard usage)
   */
  async validateUser(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  /**
   * SOCIAL LOGIN / SIGNUP
   * - Check if user exists by email or social ID
   * - If not, create new user
   * - Return JWT + User info
   */
  async socialLogin(socialUser: any) {
    let user = await this.userRepository.findOne({
      where: [
        { email: socialUser.email },
        { googleId: socialUser.googleId },
        { facebookId: socialUser.facebookId },
      ],
    });

    if (!user) {
      user = this.userRepository.create({
        email: socialUser.email,
        fullName: socialUser.fullName,
        googleId: socialUser.googleId,
        facebookId: socialUser.facebookId,
        profileImage: socialUser.profileImage,
        role: socialUser.role || 'merchant',
        subscriptionTier: 'free',
      });
      await this.userRepository.save(user);
    } else {
      // Update social ID if not present
      if (socialUser.googleId && !user.googleId) {
        user.googleId = socialUser.googleId;
        await this.userRepository.save(user);
      }
      if (socialUser.facebookId && !user.facebookId) {
        user.facebookId = socialUser.facebookId;
        await this.userRepository.save(user);
      }
    }

    const token = this.generateToken(user.id, user.email, user.role);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        companyName: user.companyName,
      },
    };
  }

  /**
   * Generate JWT Token
   */
  private generateToken(userId: string, email: string, role: string): string {
    return this.jwtService.sign({
      sub: userId,
      email,
      role,
    });
  }
}
