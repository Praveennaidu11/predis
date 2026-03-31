import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GenerationService } from './generation.service';
import { CreateGenerationJobDto } from './dto/create-generation-job.dto';

@Controller('generation')
@UseGuards(JwtAuthGuard)
export class GenerationController {
  constructor(private generation: GenerationService) {}

  /**
   * Why this endpoint exists:
   * - Provides a single API contract for Merchant + Admin generation flows.
   * - Returns immediately with a job id so the UI can poll.
   */
  @Post('jobs')
  async createJob(@Request() req, @Body() dto: CreateGenerationJobDto) {
    return this.generation.createJob(req.user, dto);
  }

  /**
   * Why this endpoint exists:
   * - Standard polling endpoint for async generation.
   * - Admins can audit any job; merchants can only see their own.
   */
  @Get('jobs/:id')
  async getJob(@Request() req, @Param('id') id: string) {
    const job = await this.generation.getJobForUser(id, req.user);
    if (!job) {
      throw new HttpException('Generation job not found', HttpStatus.NOT_FOUND);
    }
    return job;
  }
}

