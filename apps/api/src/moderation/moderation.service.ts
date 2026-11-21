import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateModerationDto } from './dto/create-moderation.dto.js';
import { UpdateModerationDto } from './dto/update-moderation.dto.js';

@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

  create(createModerationDto: CreateModerationDto) {
    return this.prisma.moderationLog.create({ data: createModerationDto });
  }

  findAll() {
    return this.prisma.moderationLog.findMany();
  }

  findOne(id: string) {
    return this.prisma.moderationLog.findUnique({ where: { id } });
  }

  update(id: string, updateModerationDto: UpdateModerationDto) {
    return this.prisma.moderationLog.update({ where: { id }, data: updateModerationDto });
  }

  remove(id: string) {
    return this.prisma.moderationLog.delete({ where: { id } });
  }
}
