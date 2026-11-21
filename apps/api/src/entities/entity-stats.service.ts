import { Injectable } from '@nestjs/common';
import { ReportStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

interface ReportForStats {
  createdAt: Date;
  status: ReportStatus;
  satisfactionRating: number | null;
  responses: { createdAt: Date }[];
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}

// Not wired to a scheduler yet (no cron/BullMQ): called synchronously right
// after whatever mutation should move the numbers (status transition, a
// new EntityResponse, a satisfaction rating).
@Injectable()
export class EntityStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async recomputeStats(entityId: string) {
    const reports: ReportForStats[] = await this.prisma.report.findMany({
      where: { entityId },
      select: {
        createdAt: true,
        status: true,
        satisfactionRating: true,
        responses: { select: { createdAt: true }, orderBy: { createdAt: 'asc' }, take: 1 },
      },
    });

    const totalReports = reports.length;
    const respondedReports = reports.filter((r) => r.responses.length > 0).length;
    const resolvedReports = reports.filter((r) => r.status === ReportStatus.RESOLVED).length;

    const responseHours = reports
      .filter((r) => r.responses.length > 0)
      .map((r) => (r.responses[0].createdAt.getTime() - r.createdAt.getTime()) / 3_600_000);
    const avgResponseHours = average(responseHours);

    const ratings = reports
      .map((r) => r.satisfactionRating)
      .filter((rating): rating is number => rating !== null);
    const avgSatisfaction = average(ratings);

    const responseRatePct = totalReports ? (respondedReports / totalReports) * 100 : 0;
    const resolutionRatePct = totalReports ? (resolvedReports / totalReports) * 100 : 0;

    const data = {
      totalReports,
      respondedReports,
      resolvedReports,
      responseRatePct,
      resolutionRatePct,
      avgResponseHours,
      avgSatisfaction,
    };

    return this.prisma.entityStats.upsert({
      where: { entityId },
      create: { entityId, ...data },
      update: { ...data, computedAt: new Date() },
    });
  }
}
