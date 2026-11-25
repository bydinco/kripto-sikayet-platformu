import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ModerationAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { RevalidateService } from '../revalidate/revalidate.service.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';
import { RemoveCommentDto } from './dto/remove-comment.dto.js';
import { canViewReport, isModerator } from './report-visibility.util.js';
import { COMMENT_MAX_URLS, DAILY_COMMENT_QUOTA, NEW_ACCOUNT_AGE_MS, NEW_ACCOUNT_DAILY_COMMENT_QUOTA } from './engagement.constants.js';
import type { JwtPayload } from '../common/types/jwt-payload.interface.js';

const URL_PATTERN = /https?:\/\/\S+/gi;

export interface PublicComment {
  id: string;
  body: string;
  isMeToo: boolean;
  createdAt: Date;
  author: { handle: string };
  isReportAuthor: boolean;
}

type CommentRow = {
  id: string;
  body: string;
  isMeToo: boolean;
  createdAt: Date;
  userId: string;
  user: { handle: string };
};

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly revalidate: RevalidateService,
  ) {}

  async create(reportId: string, dto: CreateCommentDto, currentUser: JwtPayload): Promise<PublicComment> {
    const report = await this.getVisibleReport(reportId, currentUser);

    const urlCount = (dto.body.match(URL_PATTERN) ?? []).length;
    if (urlCount > COMMENT_MAX_URLS) {
      throw new BadRequestException(`Bir yorumda en fazla ${COMMENT_MAX_URLS} bağlantı olabilir.`);
    }

    await this.assertDailyQuota(currentUser.sub);

    const comment = await this.prisma.reportComment.create({
      data: { reportId, userId: currentUser.sub, body: dto.body, isMeToo: false },
      select: { id: true, body: true, isMeToo: true, createdAt: true, userId: true, user: { select: { handle: true } } },
    });

    await this.revalidate.revalidate({ tags: [`report:${reportId}`] });
    return this.toPublicShape(comment, report.authorId);
  }

  async findAll(
    reportId: string,
    currentUser: JwtPayload | undefined,
    pagination: { limit?: number; page?: number },
  ): Promise<PublicComment[]> {
    const report = await this.getVisibleReport(reportId, currentUser);

    const take = Math.min(Math.max(pagination.limit ?? 20, 1), 50);
    const page = Math.max(pagination.page ?? 1, 1);
    const skip = (page - 1) * take;

    // Removed comments never appear in this list for anyone, moderators
    // included — the moderation timeline (ModerationLog/HIDE_COMMENT) is
    // the audit trail for what was hidden and why, not this endpoint.
    const comments = await this.prisma.reportComment.findMany({
      where: { reportId, removedAt: null },
      orderBy: { createdAt: 'asc' },
      skip,
      take,
      select: { id: true, body: true, isMeToo: true, createdAt: true, userId: true, user: { select: { handle: true } } },
    });

    return comments.map((comment) => this.toPublicShape(comment, report.authorId));
  }

  async remove(reportId: string, commentId: string, dto: RemoveCommentDto, currentUser: JwtPayload) {
    await this.getVisibleReport(reportId, currentUser);

    const comment = await this.prisma.reportComment.findUnique({ where: { id: commentId } });
    if (!comment || comment.reportId !== reportId || comment.removedAt) {
      throw new NotFoundException('Yorum bulunamadı.');
    }

    const isOwnComment = comment.userId === currentUser.sub;
    const isModeratorHidingOthers = isModerator(currentUser.role) && !isOwnComment;

    if (!isOwnComment && !isModeratorHidingOthers) {
      throw new ForbiddenException('Sadece kendi yorumunuzu silebilirsiniz.');
    }

    let reason: string | null = null;
    if (isModeratorHidingOthers) {
      reason = dto.reason?.trim() || null;
      if (!reason) {
        throw new BadRequestException('Yorumu gizlemek için gerekçe zorunludur.');
      }
    }

    await this.prisma.$transaction([
      this.prisma.reportComment.update({
        where: { id: commentId },
        data: { removedAt: new Date(), removedById: currentUser.sub, removedReason: reason },
      }),
      ...(isModeratorHidingOthers
        ? [
            this.prisma.moderationLog.create({
              data: {
                reportId,
                commentId,
                moderatorId: currentUser.sub,
                action: ModerationAction.HIDE_COMMENT,
                reason,
              },
            }),
          ]
        : []),
    ]);

    await this.revalidate.revalidate({ tags: [`report:${reportId}`] });
    return { removed: true };
  }

  private async assertDailyQuota(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
    const isNewAccount = !!user && Date.now() - user.createdAt.getTime() < NEW_ACCOUNT_AGE_MS;
    const quota = isNewAccount ? NEW_ACCOUNT_DAILY_COMMENT_QUOTA : DAILY_COMMENT_QUOTA;

    const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const commentsInWindow = await this.prisma.reportComment.count({
      where: { userId, isMeToo: false, createdAt: { gte: windowStart } },
    });
    if (commentsInWindow >= quota) {
      throw new HttpException('Günlük yorum kotanız doldu, lütfen daha sonra tekrar deneyin.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private toPublicShape(comment: CommentRow, reportAuthorId: string): PublicComment {
    return {
      id: comment.id,
      body: comment.body,
      isMeToo: comment.isMeToo,
      createdAt: comment.createdAt,
      author: { handle: comment.user.handle },
      isReportAuthor: comment.userId === reportAuthorId,
    };
  }

  private async getVisibleReport(reportId: string, currentUser?: JwtPayload) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report || !canViewReport(report, currentUser)) {
      throw new NotFoundException('Şikayet bulunamadı.');
    }
    return report;
  }
}
