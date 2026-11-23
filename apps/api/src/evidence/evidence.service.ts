import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Role, ReportStatus, StatusActorType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ScoringService } from '../scoring/scoring.service.js';
import { RevalidateService } from '../revalidate/revalidate.service.js';
import { CreateEvidenceDto } from './dto/create-evidence.dto.js';
import { UpdateEvidenceDto } from './dto/update-evidence.dto.js';
import { isPublicStatus } from '../reports/report-state-machine.js';
import { STORAGE_PROVIDER, type StorageProvider } from '../storage/storage-provider.interface.js';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringService,
    private readonly revalidate: RevalidateService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

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

  async findAll(currentUser?: JwtPayload, reportId?: string) {
    const evidences = await this.prisma.evidence.findMany({
      where: reportId ? { reportId } : undefined,
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
    const updated = await this.prisma.evidence.update({
      where: { id },
      data: updateEvidenceDto,
      include: { report: { select: { id: true, entityId: true } } },
    });

    if (updateEvidenceDto.approved !== undefined) {
      // approved/unapproved evidence changes which reports qualify for the
      // complaint-based risk factors (REPORT_RATE, CHAIN_VERIFIED_RATIO, ...)
      // and whether this file/link is shown on the report's own page.
      await this.scoring.safeRecomputeScore(updated.report.entityId);
      await this.revalidate.revalidate({ tags: [`report:${updated.report.id}`] });
    }

    const { report: _report, ...rest } = updated;
    return rest;
  }

  async remove(id: string, currentUser: JwtPayload) {
    const evidence = await this.assertOwnsEvidence(id, currentUser);
    await this.prisma.evidence.delete({ where: { id } });
    if (evidence.storageKey) {
      await this.storage.delete(evidence.storageKey);
    }
    return evidence;
  }

  // Returns the evidence row so callers (remove) don't need a second fetch.
  private async assertOwnsEvidence(evidenceId: string, currentUser: JwtPayload) {
    const evidence = await this.prisma.evidence.findUnique({
      where: { id: evidenceId },
      include: { report: { select: { authorId: true, status: true } } },
    });
    if (!evidence) {
      throw new NotFoundException('Kanıt bulunamadı.');
    }
    if (isModerator(currentUser.role)) return evidence;
    if (evidence.report.authorId !== currentUser.sub) {
      throw new ForbiddenException('Sadece kendi şikayetinizin kanıtını değiştirebilirsiniz.');
    }
    // File evidence can only be removed by its author while the report is
    // still PENDING/NEEDS_EVIDENCE — once it's in the moderation/public
    // pipeline, only a moderator/admin can take it down.
    if (
      evidence.storageKey &&
      evidence.report.status !== ReportStatus.PENDING &&
      evidence.report.status !== ReportStatus.NEEDS_EVIDENCE
    ) {
      throw new ForbiddenException('Bu dosya kanıtı artık yazar tarafından silinemez.');
    }
    return evidence;
  }
}
