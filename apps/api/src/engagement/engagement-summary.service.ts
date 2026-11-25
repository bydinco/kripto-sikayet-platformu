import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { canViewReport } from './report-visibility.util.js';
import type { JwtPayload } from '../common/types/jwt-payload.interface.js';

export interface EngagementSummary {
  helpfulCount: number;
  meTooCount: number;
  commentCount: number;
  myHelpful: boolean;
  myMeToo: boolean;
}

@Injectable()
export class EngagementSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(reportId: string, currentUser?: JwtPayload): Promise<EngagementSummary> {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report || !canViewReport(report, currentUser)) {
      throw new NotFoundException('Şikayet bulunamadı.');
    }

    const [helpfulCount, meTooCount, commentCount, myVote, myMeToo] = await Promise.all([
      this.prisma.reportVote.count({ where: { reportId } }),
      this.prisma.reportComment.count({ where: { reportId, isMeToo: true, removedAt: null } }),
      this.prisma.reportComment.count({ where: { reportId, isMeToo: false, removedAt: null } }),
      currentUser
        ? this.prisma.reportVote.findUnique({ where: { reportId_userId: { reportId, userId: currentUser.sub } } })
        : Promise.resolve(null),
      currentUser
        ? this.prisma.reportComment.findUnique({
            where: { meTooReportId_userId: { meTooReportId: reportId, userId: currentUser.sub } },
          })
        : Promise.resolve(null),
    ]);

    return {
      helpfulCount,
      meTooCount,
      commentCount,
      myHelpful: !!myVote,
      myMeToo: !!myMeToo,
    };
  }
}
