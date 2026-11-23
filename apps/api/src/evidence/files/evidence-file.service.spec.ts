import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ReportStatus, Role } from '@prisma/client';
import sharp from 'sharp';
import { EvidenceFileService } from './evidence-file.service.js';
import type { StorageProvider } from '../../storage/storage-provider.interface.js';
import type { JwtPayload } from '../../common/types/jwt-payload.interface.js';

const AUTHOR: JwtPayload = { sub: 'author-1', role: Role.USER };

function fakeMulterFile(buffer: Buffer): Express.Multer.File {
  return { buffer } as Express.Multer.File;
}

function makePrisma(report: { id: string; status: ReportStatus; authorId: string }) {
  return {
    report: { findUnique: vi.fn().mockResolvedValue(report), update: vi.fn() },
    evidence: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'ev-1', ...data })),
    },
    reportStatusHistory: { create: vi.fn() },
    $transaction: vi.fn(),
  };
}

function makeStorage(): StorageProvider {
  return { put: vi.fn().mockResolvedValue(undefined), getObject: vi.fn(), delete: vi.fn().mockResolvedValue(undefined) };
}

async function realPng(): Promise<Buffer> {
  return sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).png().toBuffer();
}

describe('EvidenceFileService.upload', () => {
  it('rejects a file whose content is not actually an allowed image type (magic-byte check)', async () => {
    const report = { id: 'r1', status: ReportStatus.PENDING, authorId: AUTHOR.sub };
    const prisma = makePrisma(report);
    const storage = makeStorage();
    const service = new EvidenceFileService(prisma as never, storage);

    const fakeExe = Buffer.from('MZ' + 'not a real image'.repeat(10));
    await expect(service.upload('r1', fakeMulterFile(fakeExe), AUTHOR)).rejects.toThrow(BadRequestException);
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('accepts a real PNG and stores it with a server-generated key', async () => {
    const report = { id: 'r1', status: ReportStatus.PENDING, authorId: AUTHOR.sub };
    const prisma = makePrisma(report);
    const storage = makeStorage();
    const service = new EvidenceFileService(prisma as never, storage);

    const png = await realPng();
    const result = await service.upload('r1', fakeMulterFile(png), AUTHOR);
    expect(result).toMatchObject({ type: 'SCREENSHOT', mimeType: 'image/png' });
    expect((result as { storageKey: string }).storageKey).toMatch(/^evidence\/[0-9a-f-]+\.png$/);
    expect(storage.put).toHaveBeenCalledTimes(1);
  });

  it('rejects an uploader who is not the report author', async () => {
    const report = { id: 'r1', status: ReportStatus.PENDING, authorId: 'someone-else' };
    const prisma = makePrisma(report);
    const service = new EvidenceFileService(prisma as never, makeStorage());
    await expect(service.upload('r1', fakeMulterFile(await realPng()), AUTHOR)).rejects.toThrow(ForbiddenException);
  });

  it('rejects upload when the report is not PENDING/NEEDS_EVIDENCE', async () => {
    const report = { id: 'r1', status: ReportStatus.PUBLISHED, authorId: AUTHOR.sub };
    const prisma = makePrisma(report);
    const service = new EvidenceFileService(prisma as never, makeStorage());
    await expect(service.upload('r1', fakeMulterFile(await realPng()), AUTHOR)).rejects.toThrow(ForbiddenException);
  });

  it('404s when the report does not exist', async () => {
    const prisma = makePrisma(undefined as never);
    prisma.report.findUnique = vi.fn().mockResolvedValue(null);
    const service = new EvidenceFileService(prisma as never, makeStorage());
    await expect(service.upload('missing', fakeMulterFile(await realPng()), AUTHOR)).rejects.toThrow(NotFoundException);
  });

  it('400s when no file is attached', async () => {
    const service = new EvidenceFileService(makePrisma({ id: 'r1', status: ReportStatus.PENDING, authorId: AUTHOR.sub }) as never, makeStorage());
    await expect(service.upload('r1', undefined, AUTHOR)).rejects.toThrow(BadRequestException);
  });

  it('rejects the 6th file on the same report', async () => {
    const report = { id: 'r1', status: ReportStatus.PENDING, authorId: AUTHOR.sub };
    const prisma = makePrisma(report);
    prisma.evidence.count = vi.fn().mockResolvedValueOnce(5); // report file count check runs first
    const service = new EvidenceFileService(prisma as never, makeStorage());
    await expect(service.upload('r1', fakeMulterFile(await realPng()), AUTHOR)).rejects.toThrow(BadRequestException);
  });

  it('rejects once the daily per-user quota is exhausted', async () => {
    const report = { id: 'r1', status: ReportStatus.PENDING, authorId: AUTHOR.sub };
    const prisma = makePrisma(report);
    prisma.evidence.count = vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(20);
    const service = new EvidenceFileService(prisma as never, makeStorage());
    await expect(service.upload('r1', fakeMulterFile(await realPng()), AUTHOR)).rejects.toThrow(ForbiddenException);
  });

  it('deletes the just-written object from storage if the DB insert fails', async () => {
    const report = { id: 'r1', status: ReportStatus.PENDING, authorId: AUTHOR.sub };
    const prisma = makePrisma(report);
    prisma.evidence.create = vi.fn().mockRejectedValue(new Error('db down'));
    const storage = makeStorage();
    const service = new EvidenceFileService(prisma as never, storage);

    await expect(service.upload('r1', fakeMulterFile(await realPng()), AUTHOR)).rejects.toThrow('db down');
    expect(storage.put).toHaveBeenCalledTimes(1);
    expect(storage.delete).toHaveBeenCalledTimes(1);
    const putKey = (storage.put as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const deleteKey = (storage.delete as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(deleteKey).toBe(putKey);
  });

  it('auto-transitions NEEDS_EVIDENCE -> PENDING when the author uploads a file', async () => {
    const report = { id: 'r1', status: ReportStatus.NEEDS_EVIDENCE, authorId: AUTHOR.sub };
    const prisma = makePrisma(report);
    const createdEvidence = { id: 'ev-1', type: 'SCREENSHOT' };
    prisma.$transaction = vi.fn().mockResolvedValue([createdEvidence]);
    const service = new EvidenceFileService(prisma as never, makeStorage());

    const result = await service.upload('r1', fakeMulterFile(await realPng()), AUTHOR);
    expect(result).toBe(createdEvidence);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
