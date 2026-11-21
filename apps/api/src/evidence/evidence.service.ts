import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role, ReportStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateEvidenceDto } from './dto/create-evidence.dto.js';
import { UpdateEvidenceDto } from './dto/update-evidence.dto.js';
import type { JwtPayload } from '../common/types/jwt-payload.interface.js';

function isModerator(role: Role): boolean {
  return role === Role.ADMIN || role === Role.MODERATOR;
}

function canView(report: { status: ReportStatus; authorId: string }, currentUser?: JwtPayload): boolean {
  if (report.status === ReportStatus.PUBLISHED) return true;
  if (!currentUser) return false;
  return isModerator(currentUser.role) || report.authorId === currentUser.sub;
}

@Injectable()
export class EvidenceService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createEvidenceDto: CreateEvidenceDto, currentUser: JwtPayload) {
    await this.assertOwnsReport(createEvidenceDto.reportId, currentUser);
    return this.prisma.evidence.create({ data: createEvidenceDto });
  }

  async findAll(currentUser?: JwtPayload) {
    const evidences = await this.prisma.evidence.findMany({
      include: { report: { select: { status: true, authorId: true } } },
    });
    return evidences
      .filter((e) => canView(e.report, currentUser))
      .map(({ report: _report, ...evidence }) => evidence);
  }

  async findOne(id: string, currentUser?: JwtPayload) {
    const evidence = await this.prisma.evidence.findUnique({
      where: { id },
      include: { report: { select: { status: true, authorId: true } } },
    });
    if (!evidence) {
      throw new NotFoundException('Kanıt bulunamadı.');
    }
    if (!canView(evidence.report, currentUser)) {
      throw new ForbiddenException('Bu kanıtı görüntüleme yetkiniz yok.');
    }
    const { report: _report, ...rest } = evidence;
    return rest;
  }

  async update(id: string, updateEvidenceDto: UpdateEvidenceDto, currentUser: JwtPayload) {
    await this.assertOwnsEvidence(id, currentUser);
    return this.prisma.evidence.update({ where: { id }, data: updateEvidenceDto });
  }

  async remove(id: string, currentUser: JwtPayload) {
    await this.assertOwnsEvidence(id, currentUser);
    return this.prisma.evidence.delete({ where: { id } });
  }

  private async assertOwnsReport(reportId: string, currentUser: JwtPayload) {
    if (isModerator(currentUser.role)) return;
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) {
      throw new NotFoundException('Şikayet bulunamadı.');
    }
    if (report.authorId !== currentUser.sub) {
      throw new ForbiddenException('Sadece kendi şikayetinize kanıt ekleyebilirsiniz.');
    }
  }

  private async assertOwnsEvidence(evidenceId: string, currentUser: JwtPayload) {
    if (isModerator(currentUser.role)) return;
    const evidence = await this.prisma.evidence.findUnique({
      where: { id: evidenceId },
      include: { report: { select: { authorId: true } } },
    });
    if (!evidence) {
      throw new NotFoundException('Kanıt bulunamadı.');
    }
    if (evidence.report.authorId !== currentUser.sub) {
      throw new ForbiddenException('Sadece kendi şikayetinizin kanıtını değiştirebilirsiniz.');
    }
  }
}
