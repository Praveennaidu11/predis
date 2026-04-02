import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PromptHistory } from '../common/entities/prompt-history.entity';

@Injectable()
export class PromptHistoryService {
  constructor(
    @InjectRepository(PromptHistory)
    private readonly historyRepository: Repository<PromptHistory>,
  ) {}

  async findAll(userId: string) {
    return this.historyRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 10,
    });
  }

  async create(userId: string, data: { prompt: string; platform: string; recipe: string }) {
    // Avoid duplicates: if same prompt exists, update its timestamp or just ignore
    const existing = await this.historyRepository.findOne({
      where: { userId, prompt: data.prompt, platform: data.platform, recipe: data.recipe },
    });

    if (existing) {
      existing.createdAt = new Date();
      return this.historyRepository.save(existing);
    }

    const history = this.historyRepository.create({
      ...data,
      userId,
    });
    return this.historyRepository.save(history);
  }

  async clear(userId: string) {
    return this.historyRepository.delete({ userId });
  }
}
