import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { RevalidateService } from '../revalidate/revalidate.service.js';
import { CreateMeTooDto } from './dto/create-me-too.dto.js';
import { canViewReport } from './report-visibility.util.js';
import type { JwtPayload } from '../common/types/jwt-payload.interface.js';

@Injectable()
export class MeTooService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly revalidate: RevalidateService,
  ) {}

  async create(reportId: string, dto: CreateMeTooDto, currentUser: JwtPayload) {
    const report = await this.getVisibleReport(reportId, currentUser);
    if (report.authorId === currentUser.sub) {
      throw new ForbiddenException('Kendi şikayetinize "ben de yaşadım" diyemezsiniz.');
    }

    try {
      const meToo = await this.prisma.reportComment.create({
        data: {
          reportId,
          userId: currentUser.sub,
          body: dto.body ?? '',
          isMeToo: true,
          meTooReportId: reportId,
        },
      });
      await this.revalidate.revalidate({ tags: [`report:${reportId}`] });
      return meToo;
    } catch (error) {
      // Unlike votes (a plain toggle), a second "ben de yaşadım" is a
      // distinct user error, not idempotent — the DELETE endpoint below is
      // the intended way to undo it. See CLAUDE.md.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Bu şikayete zaten "ben de yaşadım" dediniz.');
      }
      throw error;
    }
  }

  async remove(reportId: string, currentUser: JwtPayload) {
    await this.getVisibleReport(reportId, currentUser);

    const existing = await this.prisma.reportComment.findUnique({
      where: { meTooReportId_userId: { meTooReportId: reportId, userId: currentUser.sub } },
    });
    if (!existing) {
      throw new NotFoundException('"Ben de yaşadım" kaydı bulunamadı.');
    }

    await this.prisma.reportComment.delete({ where: { id: existing.id } });
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
