import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateModerationDto } from './dto/create-moderation.dto.js';

@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

  // moderatorId is passed in separately (from @CurrentUser() in the
  // controller), never taken from the client-supplied DTO.
  create(createModerationDto: CreateModerationDto, moderatorId: string) {
    return this.prisma.moderationLog.create({ data: { ...createModerationDto, moderatorId } });
  }

  findAll(reportId?: string) {
    return this.prisma.moderationLog.findMany({
      where: reportId ? { reportId } : undefined,
      orderBy: { createdAt: 'asc' },
    });
  }

  findOne(id: string) {
    return this.prisma.moderationLog.findUnique({ where: { id } });
  }
}
