import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EvidenceType, ReportStatus, StatusActorType } from '@prisma/client';
import { createHash } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import { PrismaService } from '../../prisma/prisma.service.js';
import { STORAGE_PROVIDER, type StorageProvider } from '../../storage/storage-provider.interface.js';
import { DAILY_FILE_UPLOAD_QUOTA, MAX_FILES_PER_REPORT, isAllowedMimeType } from './evidence-file.constants.js';
import { generateEvidenceStorageKey } from './evidence-storage-key.js';
import { recodeImage } from './recode-image.js';
import type { JwtPayload } from '../../common/types/jwt-payload.interface.js';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class EvidenceFileService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  // Sequence per CLAUDE.md: validate content → recode (strip metadata) →
  // write to storage → create the Evidence row. If the DB write fails, the
  // just-written object is deleted; if storage.put fails, no row is ever
  // created.
  async upload(reportId: string, file: Express.Multer.File | undefined, currentUser: JwtPayload) {
    if (!file) {
      throw new BadRequestException('Dosya gerekli.');
    }

    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) {
      throw new NotFoundException('Şikayet bulunamadı.');
    }
    if (report.authorId !== currentUser.sub) {
      throw new ForbiddenException('Sadece kendi şikayetinize kanıt ekleyebilirsiniz.');
    }
    if (report.status !== ReportStatus.PENDING && report.status !== ReportStatus.NEEDS_EVIDENCE) {
      throw new ForbiddenException('Dosya kanıtı sadece beklemedeki veya kanıt istenen bir şikayete eklenebilir.');
    }

    const existingFileCount = await this.prisma.evidence.count({
      where: { reportId, storageKey: { not: null } },
    });
    if (existingFileCount >= MAX_FILES_PER_REPORT) {
      throw new BadRequestException(`Bir şikayete en fazla ${MAX_FILES_PER_REPORT} dosya eklenebilir.`);
    }

    const dailyCount = await this.prisma.evidence.count({
      where: {
        storageKey: { not: null },
        createdAt: { gte: new Date(Date.now() - DAY_MS) },
        report: { authorId: currentUser.sub },
      },
    });
    if (dailyCount >= DAILY_FILE_UPLOAD_QUOTA) {
      throw new ForbiddenException('Günlük dosya yükleme kotanız doldu, lütfen daha sonra tekrar deneyin.');
    }

    // Detected from content (magic bytes), never from the client's
    // filename or declared Content-Type.
    const detected = await fileTypeFromBuffer(file.buffer);
    if (!detected || !isAllowedMimeType(detected.mime)) {
      throw new BadRequestException('Sadece PNG, JPEG veya WebP görüntü dosyaları kabul edilir.');
    }

    const recoded = await recodeImage(file.buffer, detected.mime);
    const sha256 = createHash('sha256').update(recoded).digest('hex');
    const storageKey = generateEvidenceStorageKey(detected.mime);

    await this.storage.put(storageKey, recoded, detected.mime);

    try {
      return await this.insertEvidenceRow(
        report,
        {
          type: EvidenceType.SCREENSHOT,
          storageKey,
          mimeType: detected.mime,
          sizeBytes: recoded.length,
          sha256,
        },
        currentUser,
      );
    } catch (error) {
      await this.storage.delete(storageKey);
      throw error;
    }
  }

  // Shared with EvidenceService.create: an author adding evidence while
  // NEEDS_EVIDENCE auto-transitions the report back to PENDING.
  private async insertEvidenceRow(
    report: { id: string; status: ReportStatus; authorId: string },
    data: {
      type: EvidenceType;
      storageKey: string;
      mimeType: string;
      sizeBytes: number;
      sha256: string;
    },
    currentUser: JwtPayload,
  ) {
    if (report.status === ReportStatus.NEEDS_EVIDENCE && report.authorId === currentUser.sub) {
      const [evidence] = await this.prisma.$transaction([
        this.prisma.evidence.create({ data: { ...data, reportId: report.id, approved: true } }),
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
    // File evidence can only be added by the author while
    // PENDING/NEEDS_EVIDENCE (enforced above), so unlike link/text
    // evidence it's never added post-publication — always approved.
    return this.prisma.evidence.create({ data: { ...data, reportId: report.id, approved: true } });
  }
}
