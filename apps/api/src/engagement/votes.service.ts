import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RevalidateService } from '../revalidate/revalidate.service.js';
import { canViewReport } from './report-visibility.util.js';
import type { JwtPayload } from '../common/types/jwt-payload.interface.js';

@Injectable()
export class VotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly revalidate: RevalidateService,
  ) {}

  async create(reportId: string, currentUser: JwtPayload) {
    const report = await this.getVisibleReport(reportId, currentUser);
    if (report.authorId === currentUser.sub) {
      throw new ForbiddenException('Kendi şikayetinize faydalı oyu veremezsiniz.');
    }

    // Only one vote value exists (helpful=true) — the endpoint is a plain
    // on/off toggle, so a repeat POST is idempotent rather than erroring.
    const vote = await this.prisma.reportVote.upsert({
      where: { reportId_userId: { reportId, userId: currentUser.sub } },
      update: { helpful: true },
      create: { reportId, userId: currentUser.sub, helpful: true },
    });

    await this.revalidate.revalidate({ tags: [`report:${reportId}`] });
    return vote;
  }

  async remove(reportId: string, currentUser: JwtPayload) {
    await this.getVisibleReport(reportId, currentUser);

    const existing = await this.prisma.reportVote.findUnique({
      where: { reportId_userId: { reportId, userId: currentUser.sub } },
    });
    if (!existing) {
      throw new NotFoundException('Oy bulunamadı.');
    }

    await this.prisma.reportVote.delete({ where: { id: existing.id } });
    await this.revalidate.revalidate({ tags: [`report:${reportId}`] });
    return { removed: true };
  }

  private async getVisibleReport(reportId: string, currentUser?: JwtPayload) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report || !canViewReport(report, currentUser)) {
      throw new NotFoundException('Şikayet bulunamadı.');
    }
    return report;
  }
}
