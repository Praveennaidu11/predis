import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { Brand } from '../common/entities/brand.entity';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class BrandService {
  constructor(
    @InjectRepository(Brand)
    private readonly brandRepository: Repository<Brand>,
  ) {}

  async create(userId: string, dto: CreateBrandDto) {
    const brand = this.brandRepository.create({
      userId,
      name: dto.name.trim(),
      logo: dto.logo?.trim() || null,
      primaryColor: dto.primaryColor || null,
      secondaryColor: dto.secondaryColor || null,
      fontFamily: dto.fontFamily?.trim() || null,
    } as any);

    return this.brandRepository.save(brand);
  }

  async findAll(userId: string) {
    return this.brandRepository.find({
      where: { userId } as any,
      order: { createdAt: 'DESC' } as any,
    });
  }

  async findTrash(userId: string) {
    return this.brandRepository.find({
      withDeleted: true,
      where: { userId, deletedAt: Not(IsNull()) } as any,
      order: { createdAt: 'DESC' } as any,
    });
  }

  async findOne(userId: string, id: string) {
    const brand = await this.brandRepository.findOne({
      where: { id, userId } as any,
    });
    if (!brand) throw new NotFoundException('Brand not found');
    return brand;
  }

  async update(userId: string, id: string, dto: UpdateBrandDto) {
    const brand = await this.findOne(userId, id);

    if (dto.name !== undefined) brand.name = dto.name.trim();
    if (dto.logo !== undefined) brand.logo = dto.logo?.trim() || null;
    if (dto.primaryColor !== undefined) brand.primaryColor = dto.primaryColor || null;
    if (dto.secondaryColor !== undefined) brand.secondaryColor = dto.secondaryColor || null;
    if (dto.fontFamily !== undefined) brand.fontFamily = dto.fontFamily?.trim() || null;

    return this.brandRepository.save(brand);
  }

  async remove(userId: string, id: string) {
    // Ensure ownership and existence
    await this.findOne(userId, id);
    // Soft delete: keep assets so restore is possible.
    const res = await this.brandRepository.softDelete({ id, userId } as any);
    if (!res.affected) throw new NotFoundException('Brand not found');
    return { deleted: 1 };
  }

  async restore(userId: string, id: string) {
    const res = await this.brandRepository.restore({ id, userId } as any);
    if (!res.affected) throw new NotFoundException('Brand not found');
    return this.findOne(userId, id);
  }

  async setLogo(userId: string, id: string, logoUrl: string) {
    const brand = await this.findOne(userId, id);
    this.tryDeleteLocalLogoFile(brand.logo);
    brand.logo = logoUrl;
    return this.brandRepository.save(brand);
  }

  private tryDeleteLocalLogoFile(logoUrl?: string | null) {
    try {
      if (!logoUrl) return;
      const marker = '/temp/brands/';
      const idx = logoUrl.indexOf(marker);
      if (idx === -1) return;

      const rel = logoUrl.slice(idx + marker.length); // "<userId>/<file>"
      if (!rel || rel.includes('..')) return;

      const fullPath = path.join(process.cwd(), 'temp', 'brands', rel);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    } catch {
      // best-effort cleanup only
    }
  }
}

