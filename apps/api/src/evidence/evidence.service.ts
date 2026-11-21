import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role, ReportStatus, StatusActorType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateEvidenceDto } from './dto/create-evidence.dto.js';
import { UpdateEvidenceDto } from './dto/update-evidence.dto.js';
import { isPublicStatus } from '../reports/report-state-machine.js';
import type { JwtPayload } from '../common/types/jwt-payload.interface.js';

function isModerator(role: Role): boolean {
  return role === Role.ADMIN || role === Role.MODERATOR;
}

function canView(
  evidence: { approved: boolean },
  report: { status: ReportStatus; authorId: string },
  currentUser?: JwtPayload,
): boolean {
  if (currentUser && (isModerator(currentUser.role) || report.authorId === currentUser.sub)) {
    return true;
  }
  // Public visitors only ever see approved evidence on a publicly visible report.
  return evidence.approved && isPublicStatus(report.status);
}

@Injectable()
export class EvidenceService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateEvidenceDto, currentUser: JwtPayload) {
    const report = await this.prisma.report.findUnique({ where: { id: dto.reportId } });
    if (!report) {
      throw new NotFoundException('Şikayet bulunamadı.');
    }
    if (!isModerator(currentUser.role) && report.authorId !== currentUser.sub) {
      throw new ForbiddenException('Sadece kendi şikayetinize kanıt ekleyebilirsiniz.');
    }

    // Evidence the author bolts on *after* the report already went public
    // waits for a moderator's approval before anyone else can see it.
    const addedPostPublicationByNonModerator = isPublicStatus(report.status) && !isModerator(currentUser.role);
    const approved = !addedPostPublicationByNonModerator;

    if (report.status === ReportStatus.NEEDS_EVIDENCE && report.authorId === currentUser.sub) {
      const [evidence] = await this.prisma.$transaction([
        this.prisma.evidence.create({ data: { ...dto, approved } }),
        this.prisma.report.update({ where: { id: report.id }, data: { status: ReportStatus.PENDING } }),
        this.prisma.reportStatusHistory.create({
          data: {
            reportId: report.id,
            fromStatus: ReportStatus.NEEDS_EVIDENCE,
            toStatus: ReportStatus.PENDING,
            actorId: currentUser.sub,
            actorType: StatusActorType.AUTHOR,
          },
        }),
      ]);
      return evidence;
    }

    return this.prisma.evidence.create({ data: { ...dto, approved } });
  }

  async findAll(currentUser?: JwtPayload) {
    const evidences = await this.prisma.evidence.findMany({
      include: { report: { select: { status: true, authorId: true } } },
    });
    return evidences
      .filter((e) => canView(e, e.report, currentUser))
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
    if (!canView(evidence, evidence.report, currentUser)) {
      throw new ForbiddenException('Bu kanıtı görüntüleme yetkiniz yok.');
    }
    const { report: _report, ...rest } = evidence;
    return rest;
  }

  async update(id: string, updateEvidenceDto: UpdateEvidenceDto, currentUser: JwtPayload) {
    if (updateEvidenceDto.approved !== undefined && !isModerator(currentUser.role)) {
      throw new ForbiddenException('Kanıt onayını sadece moderatör/admin verebilir.');
    }
    await this.assertOwnsEvidence(id, currentUser);
    return this.prisma.evidence.update({ where: { id }, data: updateEvidenceDto });
  }

  async remove(id: string, currentUser: JwtPayload) {
    await this.assertOwnsEvidence(id, currentUser);
    return this.prisma.evidence.delete({ where: { id } });
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
