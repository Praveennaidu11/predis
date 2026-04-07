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
import { AdminSettingsAudit, AdminSettingsAuditAction } from '../common/entities/admin-settings-audit.entity';
import { CreateAdminSettingDto } from './dto/create-admin-setting.dto';
import { UpdateAdminSettingDto } from './dto/update-admin-setting.dto';
import { UpsertAdminSettingDto } from './dto/upsert-admin-setting.dto';

function isMaskedPlaceholder(value: string | undefined): boolean {
  if (value === undefined) return false;
  const t = value.trim();
  return t.length >= 6 && /^\*+$/.test(t);
}

type ActorContext = {
  userId?: string;
  email?: string;
};

function maskSettingValue(row: AdminSettings): AdminSettings {
  if (!row.isEncrypted) return row;
  return {
    ...row,
    value: row.value ? '********' : null,
  };
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
    @InjectRepository(AdminSettingsAudit)
    private settingsAuditRepository: Repository<AdminSettingsAudit>,
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

  async getContent(params?: { status?: string; limit?: number; offset?: number }) {
    const status = params?.status;
    const rawLimit = params?.limit ?? 100;
    const limit = Math.max(1, Math.min(rawLimit, 200));
    const offset = Math.max(0, params?.offset ?? 0);

    const qb = this.contentRepository
      .createQueryBuilder('c')
      .leftJoin('c.brand', 'b')
      .leftJoin('c.user', 'u')
      .orderBy('c.createdAt', 'DESC')
      .take(limit)
      .skip(offset)
      .select([
        'c.id',
        'c.userId',
        'c.type',
        'c.prompt',
        'c.generatedText',
        'c.generatedImage',
        'c.generatedVideo',
        'c.status',
        'c.platform',
        'c.scheduledAt',
        'c.publishedAt',
        'c.createdAt',
        'c.updatedAt',
        'b.id',
        'b.name',
        'b.logo',
        'u.id',
        'u.email',
        'u.fullName',
        'u.role',
      ]);

    if (status && status !== 'all') {
      qb.where('c.status = :status', { status });
    }

    const rows = await qb.getMany();
    return rows;
  }

  async updateUserTier(userId: string, tier: string) {
    await this.userRepository.update({ id: userId }, { subscriptionTier: tier });
    return this.userRepository.findOne({ where: { id: userId } });
  }

  async getSettings(params?: {
    search?: string;
    category?: string;
    limit?: number;
    offset?: number;
  }) {
    const qb = this.settingsRepository.createQueryBuilder('s');
    qb.orderBy('s.key', 'ASC');

    if (params?.category) {
      qb.andWhere('s.category = :category', { category: params.category });
    }
    if (params?.search) {
      qb.andWhere('(s.key ILIKE :q OR s.category ILIKE :q)', {
        q: `%${params.search}%`,
      });
    }
    if (params?.offset) qb.skip(params.offset);
    if (params?.limit) qb.take(params.limit);

    const rows = await qb.getMany();
    return rows.map(maskSettingValue);
  }

  async getSettingById(id: string) {
    const row = await this.settingsRepository.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Setting not found');
    return maskSettingValue(row);
  }

  private async writeAudit(params: {
    action: AdminSettingsAuditAction;
    settingId: string | null;
    settingKey: string;
    oldValue: string | null;
    newValue: string | null;
    wasEncrypted: boolean;
    actor?: ActorContext;
  }) {
    const shouldRedact = params.wasEncrypted;
    const audit = this.settingsAuditRepository.create({
      action: params.action,
      settingId: params.settingId,
      settingKey: params.settingKey,
      actorUserId: params.actor?.userId ?? null,
      actorEmail: params.actor?.email ?? null,
      oldValue: shouldRedact ? null : params.oldValue,
      newValue: shouldRedact ? null : params.newValue,
      oldValueRedacted: shouldRedact && params.oldValue !== null,
      newValueRedacted: shouldRedact && params.newValue !== null,
      wasEncrypted: params.wasEncrypted,
    });
    await this.settingsAuditRepository.save(audit);
  }

  async createSetting(dto: CreateAdminSettingDto, actor?: ActorContext) {
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
    const saved = await this.settingsRepository.save(row);
    await this.writeAudit({
      action: 'create',
      settingId: saved.id,
      settingKey: saved.key,
      oldValue: null,
      newValue: saved.value ?? null,
      wasEncrypted: saved.isEncrypted,
      actor,
    });
    return maskSettingValue(saved);
  }

  async updateSettingById(id: string, dto: UpdateAdminSettingDto, actor?: ActorContext) {
    const row = await this.settingsRepository.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Setting not found');
    const before = { ...row };
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
    const saved = await this.settingsRepository.save(row);
    await this.writeAudit({
      action: 'update',
      settingId: saved.id,
      settingKey: saved.key,
      oldValue: before.value ?? null,
      newValue: saved.value ?? null,
      wasEncrypted: saved.isEncrypted || before.isEncrypted,
      actor,
    });
    return maskSettingValue(saved);
  }

  async removeSetting(id: string, actor?: ActorContext) {
    const row = await this.settingsRepository.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Setting not found');
    await this.settingsRepository.delete({ id });
    await this.writeAudit({
      action: 'delete',
      settingId: row.id,
      settingKey: row.key,
      oldValue: row.value ?? null,
      newValue: null,
      wasEncrypted: row.isEncrypted,
      actor,
    });
  }

  async upsertSetting(dto: UpsertAdminSettingDto, actor?: ActorContext) {
    const existing = await this.settingsRepository.findOne({ where: { key: dto.key } });
    const safeValue =
      dto.value !== undefined && !isMaskedPlaceholder(dto.value)
        ? dto.value
        : undefined;
    if (existing) {
      const before = { ...existing };
      if (safeValue !== undefined) existing.value = safeValue;
      if (dto.category !== undefined) existing.category = dto.category;
      if (dto.isEncrypted !== undefined) existing.isEncrypted = dto.isEncrypted;
      const saved = await this.settingsRepository.save(existing);
      await this.writeAudit({
        action: 'upsert',
        settingId: saved.id,
        settingKey: saved.key,
        oldValue: before.value ?? null,
        newValue: saved.value ?? null,
        wasEncrypted: saved.isEncrypted || before.isEncrypted,
        actor,
      });
      return maskSettingValue(saved);
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
    const saved = await this.settingsRepository.save(row);
    await this.writeAudit({
      action: 'upsert',
      settingId: saved.id,
      settingKey: saved.key,
      oldValue: null,
      newValue: saved.value ?? null,
      wasEncrypted: saved.isEncrypted,
      actor,
    });
    return maskSettingValue(saved);
  }

  async updateSetting(key: string, value: string) {
    return this.upsertSetting({ key, value });
  }

  async getSettingsAudit(params?: {
    key?: string;
    action?: AdminSettingsAuditAction;
    actorUserId?: string;
    limit?: number;
    offset?: number;
  }) {
    const qb = this.settingsAuditRepository.createQueryBuilder('a');
    qb.orderBy('a.createdAt', 'DESC');

    if (params?.key) qb.andWhere('a.settingKey = :key', { key: params.key });
    if (params?.action) qb.andWhere('a.action = :action', { action: params.action });
    if (params?.actorUserId)
      qb.andWhere('a.actorUserId = :actorUserId', { actorUserId: params.actorUserId });
    if (params?.offset) qb.skip(params.offset);
    qb.take(params?.limit ?? 50);

    const [rows, total] = await qb.getManyAndCount();
    return { rows, total };
  }
}
