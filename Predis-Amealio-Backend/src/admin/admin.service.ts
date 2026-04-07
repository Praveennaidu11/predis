import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { User } from '../common/entities/user.entity';
import { Content } from '../common/entities/content.entity';
import { AdminSettings } from '../common/entities/admin-settings.entity';
import { CreateAdminSettingDto } from './dto/create-admin-setting.dto';
import { UpdateAdminSettingDto } from './dto/update-admin-setting.dto';
import { UpsertAdminSettingDto } from './dto/upsert-admin-setting.dto';

function isMaskedPlaceholder(value: string | undefined): boolean {
  if (value === undefined) return false;
  const t = value.trim();
  return t.length >= 6 && /^\*+$/.test(t);
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Content)
    private contentRepository: Repository<Content>,
    @InjectRepository(AdminSettings)
    private settingsRepository: Repository<AdminSettings>,
  ) {}

  async getStats() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [totalUsers, totalContent, activeUsers] = await Promise.all([
      this.userRepository.count(),
      this.contentRepository.count(),
      this.userRepository.count({
        where: {
          updatedAt: MoreThanOrEqual(thirtyDaysAgo),
        },
      }),
    ]);

    // Get users by role
    const usersByRoleData = await this.userRepository
      .createQueryBuilder('user')
      .select('user.role', 'role')
      .addSelect('COUNT(*)', 'count')
      .groupBy('user.role')
      .getRawMany();

    const usersByRole = Object.fromEntries(
      usersByRoleData.map(r => [r.role, parseInt(r.count)])
    );

    // Get content by status
    const contentByStatusData = await this.contentRepository
      .createQueryBuilder('content')
      .select('content.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('content.status')
      .getRawMany();

    const contentByStatus = Object.fromEntries(
      contentByStatusData.map(c => [c.status, parseInt(c.count)])
    );

    return {
      totalUsers,
      totalContent,
      activeUsers,
      usersByRole,
      contentByStatus,
      revenueThisMonth: 45000,
    };
  }

  async getUsers(limit = 100) {
    return this.userRepository.find({
      take: limit,
      order: { createdAt: 'DESC' },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        subscriptionTier: true,
        createdAt: true,
      },
    });
  }

  async getContent(filterStatus?: string, limit = 100) {
    const where: any = {};
    if (filterStatus && filterStatus !== 'all') {
      where.status = filterStatus;
    }

    return this.contentRepository.find({
      where,
      take: limit,
      order: { createdAt: 'DESC' },
      relations: ['brand', 'user'],
      select: {
        id: true,
        userId: true,
        type: true,
        prompt: true,
        generatedText: true,
        generatedImage: true,
        generatedVideo: true,
        status: true,
        platform: true,
        scheduledAt: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
        brand: {
          id: true,
          name: true,
          logo: true,
        } as any,
        user: {
          id: true,
          email: true,
          fullName: true,
          role: true,
        } as any,
      } as any,
    });
  }

  async updateUserTier(userId: string, tier: string) {
    await this.userRepository.update({ id: userId }, { subscriptionTier: tier });
    return this.userRepository.findOne({ where: { id: userId } });
  }

  async getSettings() {
    return this.settingsRepository.find({ order: { key: 'ASC' } });
  }

  async getSettingById(id: string) {
    const row = await this.settingsRepository.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Setting not found');
    return row;
  }

  async createSetting(dto: CreateAdminSettingDto) {
    const taken = await this.settingsRepository.exist({ where: { key: dto.key } });
    if (taken) {
      throw new ConflictException(`Setting with key "${dto.key}" already exists`);
    }
    const row = this.settingsRepository.create({
      key: dto.key,
      value: dto.value ?? null,
      category: dto.category ?? null,
      isEncrypted: dto.isEncrypted ?? false,
    });
    return this.settingsRepository.save(row);
  }

  async updateSettingById(id: string, dto: UpdateAdminSettingDto) {
    const row = await this.settingsRepository.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Setting not found');
    if (dto.key !== undefined && dto.key !== row.key) {
      const taken = await this.settingsRepository.exist({ where: { key: dto.key } });
      if (taken) throw new ConflictException('Key already in use');
      row.key = dto.key;
    }
    if (dto.value !== undefined && !isMaskedPlaceholder(dto.value)) {
      row.value = dto.value;
    }
    if (dto.category !== undefined) row.category = dto.category;
    if (dto.isEncrypted !== undefined) row.isEncrypted = dto.isEncrypted;
    return this.settingsRepository.save(row);
  }

  async removeSetting(id: string) {
    const res = await this.settingsRepository.delete({ id });
    if (!res.affected) throw new NotFoundException('Setting not found');
  }

  async upsertSetting(dto: UpsertAdminSettingDto) {
    const existing = await this.settingsRepository.findOne({ where: { key: dto.key } });
    const safeValue =
      dto.value !== undefined && !isMaskedPlaceholder(dto.value)
        ? dto.value
        : undefined;
    if (existing) {
      if (safeValue !== undefined) existing.value = safeValue;
      if (dto.category !== undefined) existing.category = dto.category;
      if (dto.isEncrypted !== undefined) existing.isEncrypted = dto.isEncrypted;
      return this.settingsRepository.save(existing);
    }
    const row = this.settingsRepository.create({
      key: dto.key,
      value:
        dto.value === undefined
          ? null
          : isMaskedPlaceholder(dto.value)
            ? null
            : dto.value,
      category: dto.category ?? null,
      isEncrypted: dto.isEncrypted ?? false,
    });
    return this.settingsRepository.save(row);
  }

  async updateSetting(key: string, value: string) {
    return this.upsertSetting({ key, value });
  }
}
