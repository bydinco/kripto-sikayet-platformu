import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, ReportStatus, StatusActorType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { EntityStatsService } from '../entities/entity-stats.service.js';
import { CreateReportDto } from './dto/create-report.dto.js';
import { CONTENT_FIELDS, SATISFACTION_FIELDS, UpdateReportDto } from './dto/update-report.dto.js';
import {
  isAdminOnlyTransition,
  isPublicStatus,
  isValidTransition,
  moderationActionFor,
  PUBLIC_REPORT_STATUSES,
} from './report-state-machine.js';
import type { JwtPayload } from '../common/types/jwt-payload.interface.js';

const ACTIVE_STATUSES_FOR_DUPLICATE_CHECK: ReportStatus[] = [
  ReportStatus.PENDING,
  ReportStatus.NEEDS_EVIDENCE,
  ReportStatus.PUBLISHED,
  ReportStatus.DISPUTED,
  ReportStatus.RESOLVED,
];
const DUPLICATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const NEW_ACCOUNT_AGE_MS = 24 * 60 * 60 * 1000;
const NEW_ACCOUNT_OPEN_REPORT_LIMIT = 3;

function isModerator(role: Role): boolean {
  return role === Role.ADMIN || role === Role.MODERATOR;
}

function hasAny<T extends object>(dto: T, fields: readonly (keyof T)[]): boolean {
  return fields.some((field) => dto[field] !== undefined);
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entityStats: EntityStatsService,
  ) {}

  async create(dto: CreateReportDto, currentUser: JwtPayload) {
    const author = await this.prisma.user.findUnique({ where: { id: currentUser.sub } });
    if (!author) {
      throw new ForbiddenException('Kullanıcı bulunamadı.');
    }

    const referenceInstant = dto.incidentAt ? new Date(dto.incidentAt) : new Date();
    const windowStart = new Date(referenceInstant.getTime() - DUPLICATE_WINDOW_MS);
    const windowEnd = new Date(referenceInstant.getTime() + DUPLICATE_WINDOW_MS);

    const candidates = await this.prisma.report.findMany({
      where: {
        entityId: dto.entityId,
        authorId: currentUser.sub,
        status: { in: ACTIVE_STATUSES_FOR_DUPLICATE_CHECK },
      },
      select: { id: true, incidentAt: true, createdAt: true },
    });
    const duplicate = candidates.find((existing) => {
      const existingReference = existing.incidentAt ?? existing.createdAt;
      return existingReference >= windowStart && existingReference <= windowEnd;
    });
    if (duplicate) {
      throw new ConflictException({
        message: 'Bu olay için zaten açık bir şikayetiniz var. Yeni kanıt eklemek için mevcut şikayeti kullanın.',
        existingReportId: duplicate.id,
      });
    }

    if (Date.now() - author.createdAt.getTime() < NEW_ACCOUNT_AGE_MS) {
      const openReports = await this.prisma.report.count({
        where: { authorId: currentUser.sub, status: { in: [ReportStatus.PENDING, ReportStatus.NEEDS_EVIDENCE] } },
      });
      if (openReports >= NEW_ACCOUNT_OPEN_REPORT_LIMIT) {
        throw new ForbiddenException('Yeni hesaplar aynı anda en fazla 3 açık şikayet açabilir.');
      }
    }

    return this.prisma.report.create({ data: { ...dto, authorId: currentUser.sub } });
  }

  findAll(currentUser?: JwtPayload, filters?: { entityId?: string; take?: number }) {
    const requestedTake = filters?.take;
    const take = Math.min(Math.max(Number.isFinite(requestedTake) ? requestedTake! : 20, 1), 50);
    const orderBy = [
      { publishedAt: { sort: 'desc' as const, nulls: 'last' as const } },
      { createdAt: 'desc' as const },
    ];
    const entityWhere = filters?.entityId ? { entityId: filters.entityId } : {};

    if (currentUser && isModerator(currentUser.role)) {
      return this.prisma.report.findMany({ where: entityWhere, orderBy, take });
    }
    return this.prisma.report.findMany({
      where: {
        ...entityWhere,
        OR: [
          { status: { in: PUBLIC_REPORT_STATUSES } },
          ...(currentUser ? [{ authorId: currentUser.sub }] : []),
        ],
      },
      orderBy,
      take,
    });
  }

  findMine(currentUser: JwtPayload) {
    return this.prisma.report.findMany({
      where: { authorId: currentUser.sub },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, currentUser?: JwtPayload) {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report || !this.canView(report, currentUser)) {
      throw new NotFoundException('Şikayet bulunamadı.');
    }
    return report;
  }

  private canView(report: { status: ReportStatus; authorId: string }, currentUser?: JwtPayload): boolean {
    if (isPublicStatus(report.status)) return true;
    if (!currentUser) return false;
    return isModerator(currentUser.role) || report.authorId === currentUser.sub;
  }

  async update(id: string, dto: UpdateReportDto, currentUser: JwtPayload) {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) {
      throw new NotFoundException('Şikayet bulunamadı.');
    }

    if (isModerator(currentUser.role)) {
      if (hasAny(dto, SATISFACTION_FIELDS)) {
        throw new ForbiddenException('Memnuniyet puanını sadece şikayet eden verebilir.');
      }
      if (dto.status) {
        return this.applyModeratorTransition(report, dto, currentUser);
      }
      return this.prisma.report.update({ where: { id }, data: dto });
    }

    return this.applyAuthorUpdate(report, dto, currentUser);
  }

  remove(id: string) {
    return this.prisma.report.delete({ where: { id } });
  }

  async requestResolution(id: string, currentUser: JwtPayload) {
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: { entity: { select: { ownerId: true } } },
    });
    if (!report) {
      throw new NotFoundException('Şikayet bulunamadı.');
    }
    if (currentUser.role !== Role.ENTITY_OWNER || report.entity.ownerId !== currentUser.sub) {
      throw new ForbiddenException('Sadece ilgili varlığın sahibi çözüm talep edebilir.');
    }
    if (report.status !== ReportStatus.PUBLISHED && report.status !== ReportStatus.DISPUTED) {
      throw new ForbiddenException('Sadece yayınlanmış veya tartışmalı şikayetler için çözüm talep edilebilir.');
    }
    return this.prisma.report.update({ where: { id }, data: { resolutionRequestedAt: new Date() } });
  }

  async approveResolution(id: string, currentUser: JwtPayload) {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) {
      throw new NotFoundException('Şikayet bulunamadı.');
    }
    if (report.authorId !== currentUser.sub) {
      throw new ForbiddenException('Sadece şikayet eden çözümü onaylayabilir.');
    }
    if (!report.resolutionRequestedAt) {
      throw new BadRequestException('Bekleyen bir çözüm talebi yok.');
    }
    if (report.status !== ReportStatus.PUBLISHED && report.status !== ReportStatus.DISPUTED) {
      throw new BadRequestException('Bu şikayet artık onaylanabilir durumda değil.');
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.report.update({
        where: { id },
        data: { status: ReportStatus.RESOLVED, resolvedAt: new Date(), resolutionRequestedAt: null },
      }),
      this.prisma.reportStatusHistory.create({
        data: {
          reportId: id,
          fromStatus: report.status,
          toStatus: ReportStatus.RESOLVED,
          actorId: currentUser.sub,
          actorType: StatusActorType.AUTHOR,
        },
      }),
    ]);

    await this.entityStats.recomputeStats(report.entityId);
    return updated;
  }

  private async applyModeratorTransition(
    report: { id: string; entityId: string; status: ReportStatus },
    dto: UpdateReportDto,
    currentUser: JwtPayload,
  ) {
    const toStatus = dto.status!;
    if (!isValidTransition(report.status, toStatus)) {
      throw new BadRequestException(`Geçersiz durum geçişi: ${report.status} -> ${toStatus}`);
    }

    if (isAdminOnlyTransition(report.status, toStatus) && currentUser.role !== Role.ADMIN) {
      throw new ForbiddenException('Bu geçişi sadece ADMIN yapabilir.');
    }
    if (!dto.reason?.trim()) {
      throw new BadRequestException('Durum değişikliği için gerekçe zorunludur.');
    }
    if (toStatus === ReportStatus.PUBLISHED) {
      const approvedEvidenceCount = await this.prisma.evidence.count({
        where: { reportId: report.id, approved: true },
      });
      if (approvedEvidenceCount < 1) {
        throw new BadRequestException('Yayınlamak için en az 1 onaylı kanıt gerekir.');
      }
    }

    const action = moderationActionFor(report.status, toStatus);
    const extra: Record<string, unknown> = {};
    if (toStatus === ReportStatus.PUBLISHED) extra.publishedAt = new Date();
    if (toStatus === ReportStatus.RESOLVED) extra.resolvedAt = new Date();

    const { reason, status: _status, ...contentFields } = dto;

    const [updated] = await this.prisma.$transaction([
      this.prisma.report.update({
        where: { id: report.id },
        data: { ...contentFields, status: toStatus, ...extra },
      }),
      this.prisma.moderationLog.create({
        data: { reportId: report.id, moderatorId: currentUser.sub, action, reason },
      }),
      this.prisma.reportStatusHistory.create({
        data: {
          reportId: report.id,
          fromStatus: report.status,
          toStatus,
          actorId: currentUser.sub,
          actorType: StatusActorType.MODERATOR,
          reason,
        },
      }),
    ]);

    await this.entityStats.recomputeStats(report.entityId);
    return updated;
  }

  private async applyAuthorUpdate(
    report: {
      id: string;
      entityId: string;
      authorId: string;
      status: ReportStatus;
      satisfactionRating: number | null;
    },
    dto: UpdateReportDto,
    currentUser: JwtPayload,
  ) {
    if (report.authorId !== currentUser.sub) {
      throw new ForbiddenException('Sadece kendi şikayetinizi düzenleyebilirsiniz.');
    }

    if (report.status === ReportStatus.PENDING || report.status === ReportStatus.NEEDS_EVIDENCE) {
      if (dto.status || dto.reason || hasAny(dto, SATISFACTION_FIELDS)) {
        throw new ForbiddenException('Bu alanları sadece moderatör/admin değiştirebilir.');
      }
      return this.prisma.report.update({ where: { id: report.id }, data: dto });
    }

    if (report.status === ReportStatus.RESOLVED) {
      if (dto.status || dto.reason || hasAny(dto, CONTENT_FIELDS)) {
        throw new ForbiddenException('Çözülmüş bir şikayette sadece memnuniyet puanı verilebilir.');
      }
      if (dto.satisfactionRating === undefined) {
        throw new BadRequestException('satisfactionRating zorunludur.');
      }
      if (report.satisfactionRating !== null) {
        throw new ForbiddenException('Bu şikayet için memnuniyet puanı zaten verildi.');
      }
      const updated = await this.prisma.report.update({
        where: { id: report.id },
        data: { satisfactionRating: dto.satisfactionRating, satisfactionNote: dto.satisfactionNote },
      });
      await this.entityStats.recomputeStats(report.entityId);
      return updated;
    }

    throw new ForbiddenException('Bu şikayet artık düzenlenemez.');
  }
}
