import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role, ReportStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateReportDto } from './dto/create-report.dto.js';
import { MODERATOR_ONLY_REPORT_FIELDS, UpdateReportDto } from './dto/update-report.dto.js';
import type { JwtPayload } from '../common/types/jwt-payload.interface.js';

const AUTHOR_EDITABLE_STATUSES: ReportStatus[] = [ReportStatus.PENDING, ReportStatus.NEEDS_EVIDENCE];

function isModerator(role: Role): boolean {
  return role === Role.ADMIN || role === Role.MODERATOR;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  create(createReportDto: CreateReportDto, authorId: string) {
    return this.prisma.report.create({ data: { ...createReportDto, authorId } });
  }

  findAll() {
    return this.prisma.report.findMany({ where: { status: ReportStatus.PUBLISHED } });
  }

  async findOne(id: string) {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report || report.status !== ReportStatus.PUBLISHED) {
      throw new NotFoundException('Şikayet bulunamadı.');
    }
    return report;
  }

  async update(id: string, updateReportDto: UpdateReportDto, currentUser: JwtPayload) {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) {
      throw new NotFoundException('Şikayet bulunamadı.');
    }

    if (!isModerator(currentUser.role)) {
      if (report.authorId !== currentUser.sub) {
        throw new ForbiddenException('Sadece kendi şikayetinizi düzenleyebilirsiniz.');
      }
      if (!AUTHOR_EDITABLE_STATUSES.includes(report.status)) {
        throw new ForbiddenException('Bu şikayet artık düzenlenemez.');
      }
      const usedModeratorField = MODERATOR_ONLY_REPORT_FIELDS.some(
        (field) => updateReportDto[field] !== undefined,
      );
      if (usedModeratorField) {
        throw new ForbiddenException('Bu alanları sadece moderatör/admin değiştirebilir.');
      }
    }

    return this.prisma.report.update({ where: { id }, data: updateReportDto });
  }

  remove(id: string) {
    return this.prisma.report.delete({ where: { id } });
  }
}
