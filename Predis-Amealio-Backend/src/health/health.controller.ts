import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';

@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  ping() {
    return { ok: true, service: 'amealio-backend', ts: new Date().toISOString() };
  }

  @Get('db')
  async db() {
    try {
      await this.dataSource.query('SELECT 1');
      return { ok: true, database: 'connected' };
    } catch (e: any) {
      throw new ServiceUnavailableException({
        ok: false,
        database: 'error',
        message: e?.message || 'Database query failed',
      });
    }
  }
}
