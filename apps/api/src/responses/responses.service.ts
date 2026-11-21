import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role, ReportStatus, StatusActorType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { EntityStatsService } from '../entities/entity-stats.service.js';
import { CreateResponseDto } from './dto/create-response.dto.js';
import type { JwtPayload } from '../common/types/jwt-payload.interface.js';

const RESPONDABLE_STATUSES: ReportStatus[] = [ReportStatus.PUBLISHED, ReportStatus.DISPUTED];

function isModerator(role: Role): boolean {
  return role === Role.ADMIN || role === Role.MODERATOR;
}

@Injectable()
export class ResponsesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entityStats: EntityStatsService,
  ) {}

  async create(reportId: string, dto: CreateResponseDto, currentUser: JwtPayload) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: { entity: { select: { id: true, ownerId: true } } },
    });
    if (!report) {
      throw new NotFoundException('Şikayet bulunamadı.');
    }

    const isOwner = currentUser.role === Role.ENTITY_OWNER && report.entity.ownerId === currentUser.sub;
    if (!isOwner && !isModerator(currentUser.role)) {
      throw new ForbiddenException('Sadece varlık sahibi veya moderatör/admin yanıt verebilir.');
    }
    if (!RESPONDABLE_STATUSES.includes(report.status)) {
      throw new ForbiddenException('Sadece yayınlanmış veya tartışmalı şikayetlere yanıt verilebilir.');
    }

    const isDispute = dto.isDispute ?? false;
    const triggersDispute = isDispute && report.status === ReportStatus.PUBLISHED;

    const [response] = await this.prisma.$transaction([
      this.prisma.entityResponse.create({
        data: {
          reportId,
          entityId: report.entityId,
          authorId: currentUser.sub,
          body: dto.body,
          isDispute,
        },
      }),
      ...(triggersDispute
        ? [
            this.prisma.report.update({ where: { id: reportId }, data: { status: ReportStatus.DISPUTED } }),
            this.prisma.reportStatusHistory.create({
              data: {
                reportId,
                fromStatus: ReportStatus.PUBLISHED,
                toStatus: ReportStatus.DISPUTED,
                actorId: currentUser.sub,
                actorType: isModerator(currentUser.role) ? StatusActorType.MODERATOR : StatusActorType.ENTITY,
              },
            }),
          ]
        : []),
    ]);

    await this.entityStats.recomputeStats(report.entityId);
    return response;
  }

  async findAll(reportId: string) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report || report.status !== ReportStatus.PUBLISHED) {
      throw new NotFoundException('Şikayet bulunamadı.');
    }
    return this.prisma.entityResponse.findMany({ where: { reportId }, orderBy: { createdAt: 'asc' } });
  }
}
