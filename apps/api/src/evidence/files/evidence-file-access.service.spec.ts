import { NotFoundException } from '@nestjs/common';
import { ReportStatus, Role } from '@prisma/client';
import { EvidenceFileAccessService } from './evidence-file-access.service.js';
import type { StorageProvider } from '../../storage/storage-provider.interface.js';
import type { JwtPayload } from '../../common/types/jwt-payload.interface.js';

const AUTHOR: JwtPayload = { sub: 'author-1', role: Role.USER };
const STRANGER: JwtPayload = { sub: 'stranger-1', role: Role.USER };
const MODERATOR: JwtPayload = { sub: 'mod-1', role: Role.MODERATOR };

function makePrisma(evidence: {
  storageKey: string | null;
  mimeType: string | null;
  approved: boolean;
  report: { id: string; status: ReportStatus; authorId: string };
}) {
  return {
    evidence: { findUnique: vi.fn().mockResolvedValue(evidence) },
    moderationLog: { create: vi.fn().mockResolvedValue({}) },
  };
}

function makeStorage(): StorageProvider {
  return { put: vi.fn(), getObject: vi.fn().mockResolvedValue({ kind: 'stream', stream: {} }), delete: vi.fn() };
}

describe('EvidenceFileAccessService.getFile', () => {
  const baseEvidence = {
    storageKey: 'evidence/abc.png',
    mimeType: 'image/png',
    report: { id: 'r1', status: ReportStatus.PENDING, authorId: AUTHOR.sub },
  };

  it('404s a stranger for unapproved evidence on a non-public report', async () => {
    const prisma = makePrisma({ ...baseEvidence, approved: false });
    const service = new EvidenceFileAccessService(prisma as never, makeStorage());
    await expect(service.getFile('ev1', STRANGER)).rejects.toThrow(NotFoundException);
  });

  it('404s an anonymous visitor the same way', async () => {
    const prisma = makePrisma({ ...baseEvidence, approved: false });
    const service = new EvidenceFileAccessService(prisma as never, makeStorage());
    await expect(service.getFile('ev1', undefined)).rejects.toThrow(NotFoundException);
  });

  it('lets the author view their own unapproved evidence', async () => {
    const prisma = makePrisma({ ...baseEvidence, approved: false });
    const service = new EvidenceFileAccessService(prisma as never, makeStorage());
    const result = await service.getFile('ev1', AUTHOR);
    expect(result.isPublic).toBe(false);
  });

  it('lets a moderator view unapproved evidence and logs a VIEW_EVIDENCE audit entry', async () => {
    const prisma = makePrisma({ ...baseEvidence, approved: false });
    const service = new EvidenceFileAccessService(prisma as never, makeStorage());
    await service.getFile('ev1', MODERATOR);
    expect(prisma.moderationLog.create).toHaveBeenCalledWith({
      data: { reportId: 'r1', moderatorId: MODERATOR.sub, action: 'VIEW_EVIDENCE' },
    });
  });

  it('does not log when a moderator views already-approved evidence', async () => {
    const prisma = makePrisma({
      ...baseEvidence,
      approved: true,
      report: { id: 'r1', status: ReportStatus.PUBLISHED, authorId: AUTHOR.sub },
    });
    const service = new EvidenceFileAccessService(prisma as never, makeStorage());
    await service.getFile('ev1', MODERATOR);
    expect(prisma.moderationLog.create).not.toHaveBeenCalled();
  });

  it('allows an anonymous visitor when approved AND the report is publicly visible', async () => {
    const prisma = makePrisma({
      ...baseEvidence,
      approved: true,
      report: { id: 'r1', status: ReportStatus.PUBLISHED, authorId: AUTHOR.sub },
    });
    const service = new EvidenceFileAccessService(prisma as never, makeStorage());
    const result = await service.getFile('ev1', undefined);
    expect(result.isPublic).toBe(true);
  });

  it('404s an anonymous visitor when approved but the report was REMOVED', async () => {
    const prisma = makePrisma({
      ...baseEvidence,
      approved: true,
      report: { id: 'r1', status: ReportStatus.REMOVED, authorId: AUTHOR.sub },
    });
    const service = new EvidenceFileAccessService(prisma as never, makeStorage());
    await expect(service.getFile('ev1', undefined)).rejects.toThrow(NotFoundException);
  });

  it('404s when the evidence row has no stored file (link/text evidence)', async () => {
    const prisma = makePrisma({ ...baseEvidence, storageKey: null, approved: true });
    const service = new EvidenceFileAccessService(prisma as never, makeStorage());
    await expect(service.getFile('ev1', AUTHOR)).rejects.toThrow(NotFoundException);
  });
});
