import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Request,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BrandService } from './brand.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';

function guessLogoExtFromMime(mime: string) {
  if (mime === 'image/png') return '.png';
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/webp') return '.webp';
  return '.png';
}

@Controller('merchant/brands')
@UseGuards(JwtAuthGuard)
export class BrandController {
  constructor(private readonly brands: BrandService) {}

  private getRequestBaseUrl(req: any) {
    const envBase = process.env.BACKEND_URL;
    if (envBase && envBase.trim()) return envBase.trim().replace(/\/$/, '');

    const proto =
      req?.headers?.['x-forwarded-proto'] ||
      req?.protocol ||
      'http';
    const host =
      req?.headers?.['x-forwarded-host'] ||
      req?.get?.('host') ||
      req?.headers?.host;
    if (!host) return `http://localhost:${process.env.PORT || 8001}`;
    return `${proto}://${host}`.replace(/\/$/, '');
  }

  @Post()
  async create(@Request() req, @Body() dto: CreateBrandDto) {
    return this.brands.create(req.user.userId, dto);
  }

  @Get()
  async list(@Request() req, @Query('trash') trash?: string) {
    if (trash === '1' || String(trash).toLowerCase() === 'true') {
      return this.brands.findTrash(req.user.userId);
    }
    return this.brands.findAll(req.user.userId);
  }

  @Get(':id')
  async getOne(@Request() req, @Param('id') id: string) {
    return this.brands.findOne(req.user.userId, id);
  }

  @Patch(':id')
  async update(@Request() req, @Param('id') id: string, @Body() dto: UpdateBrandDto) {
    return this.brands.update(req.user.userId, id, dto);
  }

  @Delete(':id')
  async remove(@Request() req, @Param('id') id: string) {
    return this.brands.remove(req.user.userId, id);
  }

  @Post(':id/restore')
  async restore(@Request() req, @Param('id') id: string) {
    return this.brands.restore(req.user.userId, id);
  }

  @Post(':id/logo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const userId = (req as any)?.user?.userId || 'unknown';
          const dest = path.join(process.cwd(), 'temp', 'brands', userId);
          try {
            fs.mkdirSync(dest, { recursive: true });
          } catch {
            // ignore
          }
          cb(null, dest);
        },
        filename: (req, file, cb) => {
          const originalExt = extname(file.originalname || '').toLowerCase();
          const safeFromMime = (req as any)?.__brandLogoExt || guessLogoExtFromMime(file.mimetype);
          const finalExt =
            originalExt && ['.png', '.jpg', '.jpeg', '.webp'].includes(originalExt)
              ? (originalExt === '.jpeg' ? '.jpg' : originalExt)
              : safeFromMime;
          cb(null, `${uuidv4()}${finalExt}`);
        },
      }),
      limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
      fileFilter: (req, file, cb) => {
        const ok = ['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype);
        (req as any).__brandLogoExt = ok
          ? guessLogoExtFromMime(file.mimetype)
          : '.png';
        cb(ok ? null : new BadRequestException('Only PNG/JPEG/WEBP images are allowed'), ok);
      },
    }),
  )
  async uploadLogo(
    @Request() req,
    @Param('id') id: string,
    @UploadedFile() file?: any,
  ) {
    if (!file) throw new BadRequestException('Logo file is required (field name: file)');

    // Static serving is already configured at /temp -> <cwd>/temp
    const userId = req.user.userId;
    const relative = `/temp/brands/${userId}/${file.filename}`;
    const logoUrl = `${this.getRequestBaseUrl(req)}${relative}`;

    return this.brands.setLogo(userId, id, logoUrl);
  }
}

