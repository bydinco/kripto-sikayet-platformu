import { Injectable } from '@nestjs/common';
import { NoticeStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { RevalidateService } from '../revalidate/revalidate.service.js';
import { CreateNoticeDto } from './dto/create-notice.dto.js';
import { UpdateNoticeDto } from './dto/update-notice.dto.js';
import type { JwtPayload } from '../common/types/jwt-payload.interface.js';

const TERMINAL_STATUSES: NoticeStatus[] = [NoticeStatus.ACCEPTED, NoticeStatus.REJECTED, NoticeStatus.COMPLETED];

@Injectable()
export class NoticesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly revalidate: RevalidateService,
  ) {}

  create(createNoticeDto: CreateNoticeDto) {
    return this.prisma.notice.create({ data: createNoticeDto });
  }

  findAll() {
    return this.prisma.notice.findMany({ orderBy: { receivedAt: 'desc' } });
  }

  findOne(id: string) {
    return this.prisma.notice.findUnique({ where: { id } });
  }

  async update(id: string, dto: UpdateNoticeDto, currentUser: JwtPayload) {
    // No status in the patch: leave decidedAt as-is (undefined = skip the
    // field). Status set to a terminal value: stamp decidedAt=now. Status
    // set back to a non-terminal value (e.g. reopened to UNDER_REVIEW):
    // clear decidedAt=null.
    const decidedAt =
      dto.status === undefined ? undefined : TERMINAL_STATUSES.includes(dto.status) ? new Date() : null;
    const notice = await this.prisma.notice.update({
      where: { id },
      data: { ...dto, handlerId: currentUser.sub, decidedAt },
    });

    const tags: string[] = [];
    if (notice.reportId) tags.push(`report:${notice.reportId}`);
    if (notice.entityId) {
      tags.push(`entity-id:${notice.entityId}`);
      // The entity page's top-level fetch is tagged by slug (unknown here
      // without a lookup), not by entityId — resolve it so that fetch is
      // invalidated immediately too, instead of waiting out its own
      // revalidate window.
      const entity = await this.prisma.entity.findUnique({
        where: { id: notice.entityId },
        select: { slug: true },
      });
      if (entity) tags.push(`entity:${entity.slug}`);
    }
    if (tags.length > 0) await this.revalidate.revalidate({ tags });

    return notice;
  }

  remove(id: string) {
    return this.prisma.notice.delete({ where: { id } });
  }
}
