import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { User } from '../common/entities/user.entity';
import * as bcrypt from 'bcryptjs';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
// All OTP + MSG91 removed
import { MSG91Service } from '../integrations/msg91/msg91.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
    private msg91Service: MSG91Service,
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
      where: { email: dto.email, role: dto.role || 'merchant' },
    });

    if (existing) {
      throw new ConflictException({
        message: `This email is already registered as a ${dto.role || 'merchant'}. Please login.`,
        errorCode: 'EMAIL_ALREADY_EXISTS'
      });
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = this.userRepository.create({
      email: dto.email,
      passwordHash: hashedPassword,
      fullName: dto.fullName,
      companyName: dto.companyName,
      role: dto.role || 'merchant',
      subscriptionTier: 'free',
    });

    await this.userRepository.save(user);

    const res = await this.msg91Service.sendEmailOTP(user.email);
    if (res.otp) {
      this.logger.log(`[DEVELOPMENT ONLY] OTP for ${user.email}: ${res.otp}`);
    }

    return {
      message: 'Account created successfully. Please verify your email with the OTP sent.',
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
      where: { email: dto.email, role: dto.role || 'merchant' },
    });

    if (!user) {
      throw new UnauthorizedException(`User not found as ${dto.role || 'merchant'}. Please sign up first.`);
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('This account uses OAuth login. Please sign in with Google.');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid password');
    }

    if (dto.role && user.role !== dto.role) {
      throw new UnauthorizedException(`This account is not registered as a ${dto.role}`);
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
      const res = await this.msg91Service.sendEmailOTP(email);
      if (res.otp) {
        this.logger.log(`[DEVELOPMENT ONLY] Forgot Password OTP for ${email}: ${res.otp}`);
      }
    }

    return {
      message: 'If an account exists for this email, a reset OTP has been sent.',
    };
  }

  async resetPassword(email: string, otp: string, newPassword: string) {
    const user = await this.userRepository.findOne({ where: { email } });

    if (!user) {
      throw new UnauthorizedException('User not found. Please sign up first.');
    }

    const isValid = await this.msg91Service.verifyEmailOTP(email, otp);
    if (!isValid) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.userRepository.update(user.id, { passwordHash: hashedPassword });

    return { message: 'Password reset successfully' };
  }

  async verifyEmailOtp(email: string, otp: string) {
    const isValid = await this.msg91Service.verifyEmailOTP(email, otp);
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
        fullName: user.fullName,
        role: user.role,
      },
    };
  }

  async resendEmailOtp(email: string) {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const res = await this.msg91Service.sendEmailOTP(email);
    if (res.otp) {
      this.logger.log(`[DEVELOPMENT ONLY] Resent OTP for ${email}: ${res.otp}`);
    }
    return {
      message: 'OTP resent to your email',
      email,
    };
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
