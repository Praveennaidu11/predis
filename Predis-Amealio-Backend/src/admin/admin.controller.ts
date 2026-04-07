import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CreateAdminSettingDto } from './dto/create-admin-setting.dto';
import { UpdateAdminSettingDto } from './dto/update-admin-setting.dto';
import { UpsertAdminSettingDto } from './dto/upsert-admin-setting.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('stats')
  async getStats() {
    return this.adminService.getStats();
  }

  @Get('users')
  async getUsers() {
    return this.adminService.getUsers();
  }

  @Get('content')
  async getContent(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    return this.adminService.getContent(status, parsedLimit || 100);
  }

  @Put('users/:id/tier')
  async updateUserTier(
    @Param('id') userId: string,
    @Body('tier') tier: string,
  ) {
    return this.adminService.updateUserTier(userId, tier);
  }

  @Get('settings')
  async listSettings(
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminService.getSettings({
      search,
      category,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Put('settings/upsert')
  async upsertSetting(@Req() req: Request, @Body() dto: UpsertAdminSettingDto) {
    const u: any = (req as any).user || {};
    return this.adminService.upsertSetting(dto, { userId: u.userId, email: u.email });
  }

  @Get('settings/:id')
  async getSetting(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getSettingById(id);
  }

  @Post('settings')
  async createSetting(@Req() req: Request, @Body() dto: CreateAdminSettingDto) {
    const u: any = (req as any).user || {};
    return this.adminService.createSetting(dto, { userId: u.userId, email: u.email });
  }

  @Patch('settings/:id')
  async patchSetting(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdminSettingDto,
  ) {
    const u: any = (req as any).user || {};
    return this.adminService.updateSettingById(id, dto, { userId: u.userId, email: u.email });
  }

  @Delete('settings/:id')
  async deleteSetting(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const u: any = (req as any).user || {};
    await this.adminService.removeSetting(id, { userId: u.userId, email: u.email });
    return { ok: true };
  }

  @Get('settings-audit')
  async listSettingsAudit(
    @Query('key') key?: string,
    @Query('action') action?: 'create' | 'update' | 'delete' | 'upsert',
    @Query('actorUserId') actorUserId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminService.getSettingsAudit({
      key,
      action,
      actorUserId,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }
}
