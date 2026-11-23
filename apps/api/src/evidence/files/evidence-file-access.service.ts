import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ModerationAction, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { isPublicStatus } from '../../reports/report-state-machine.js';
import { STORAGE_PROVIDER, type StorageObject, type StorageProvider } from '../../storage/storage-provider.interface.js';
import type { JwtPayload } from '../../common/types/jwt-payload.interface.js';

function isModerator(role: Role): boolean {
  return role === Role.ADMIN || role === Role.MODERATOR;
}

export interface EvidenceFileResult {
  storageObject: StorageObject;
  mimeType: string;
  isPublic: boolean;
}

@Injectable()
export class EvidenceFileAccessService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  // Author/MODERATOR/ADMIN can always view; everyone else (including
  // anonymous) only when the evidence is approved AND the report is
  // publicly visible. Every other case is a 404, not 403 — existence of a
  // non-public evidence row is never revealed.
  async getFile(evidenceId: string, currentUser: JwtPayload | undefined): Promise<EvidenceFileResult> {
    const evidence = await this.prisma.evidence.findUnique({
      where: { id: evidenceId },
      include: { report: { select: { id: true, status: true, authorId: true } } },
    });
    if (!evidence || !evidence.storageKey || !evidence.mimeType) {
      throw new NotFoundException();
    }

    const isOwnerOrModerator =
      Boolean(currentUser) && (isModerator(currentUser!.role) || evidence.report.authorId === currentUser!.sub);
    const isPublic = evidence.approved && isPublicStatus(evidence.report.status);

    if (!isOwnerOrModerator && !isPublic) {
      throw new NotFoundException();
    }

    if (currentUser && isModerator(currentUser.role) && !evidence.approved) {
      await this.prisma.moderationLog.create({
        data: { reportId: evidence.report.id, moderatorId: currentUser.sub, action: ModerationAction.VIEW_EVIDENCE },
      });
    }

    const storageObject = await this.storage.getObject(evidence.storageKey);
    return { storageObject, mimeType: evidence.mimeType, isPublic };
  }
}
