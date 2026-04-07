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
  UseGuards,
} from '@nestjs/common';
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
  async listSettings() {
    return this.adminService.getSettings();
  }

  @Put('settings/upsert')
  async upsertSetting(@Body() dto: UpsertAdminSettingDto) {
    return this.adminService.upsertSetting(dto);
  }

  @Get('settings/:id')
  async getSetting(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getSettingById(id);
  }

  @Post('settings')
  async createSetting(@Body() dto: CreateAdminSettingDto) {
    return this.adminService.createSetting(dto);
  }

  @Patch('settings/:id')
  async patchSetting(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdminSettingDto,
  ) {
    return this.adminService.updateSettingById(id, dto);
  }

  @Delete('settings/:id')
  async deleteSetting(@Param('id', ParseUUIDPipe) id: string) {
    await this.adminService.removeSetting(id);
    return { ok: true };
  }
}
