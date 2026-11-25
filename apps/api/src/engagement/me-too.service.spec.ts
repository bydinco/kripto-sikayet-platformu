import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, ReportStatus, Role } from '@prisma/client';
import { MeTooService } from './me-too.service.js';
import type { JwtPayload } from '../common/types/jwt-payload.interface.js';

const AUTHOR: JwtPayload = { sub: 'author-1', role: Role.USER };
const VOTER: JwtPayload = { sub: 'voter-1', role: Role.USER };

function duplicateError() {
  return new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '7.10.1' });
}

function makePrisma(report: { id: string; status: ReportStatus; authorId: string } | null, opts: { createFails?: boolean; existing?: unknown } = {}) {
  return {
    report: { findUnique: vi.fn().mockResolvedValue(report) },
    reportComment: {
      create: opts.createFails
        ? vi.fn().mockRejectedValue(duplicateError())
        : vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'mt1', ...data })),
      findUnique: vi.fn().mockResolvedValue(opts.existing ?? null),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  };
}

function makeRevalidate() {
  return { revalidate: vi.fn().mockResolvedValue(undefined) };
}

describe('MeTooService', () => {
  it('404s when the report is not visible', async () => {
    const report = { id: 'r1', status: ReportStatus.REJECTED, authorId: AUTHOR.sub };
    const service = new MeTooService(makePrisma(report) as never, makeRevalidate() as never);
    await expect(service.create('r1', {}, VOTER)).rejects.toThrow(NotFoundException);
  });

  it('403s when the report author tries to say "me too" on their own report', async () => {
    const report = { id: 'r1', status: ReportStatus.PUBLISHED, authorId: AUTHOR.sub };
    const service = new MeTooService(makePrisma(report) as never, makeRevalidate() as never);
    await expect(service.create('r1', {}, AUTHOR)).rejects.toThrow(ForbiddenException);
  });

  it('creates a me-too row with meTooReportId set to the report id', async () => {
    const report = { id: 'r1', status: ReportStatus.PUBLISHED, authorId: AUTHOR.sub };
    const prisma = makePrisma(report);
    const service = new MeTooService(prisma as never, makeRevalidate() as never);
    const result = await service.create('r1', { body: 'me too!' }, VOTER);
    expect(result).toMatchObject({ isMeToo: true, meTooReportId: 'r1' });
  });

  // Decision (see CLAUDE.md): a second "ben de yaşadım" is a 409 Conflict,
  // not idempotent — unlike the plain helpful-vote toggle. Undo it via
  // DELETE /reports/:reportId/me-too instead.
  it('409s on a duplicate me-too (unique constraint violation)', async () => {
    const report = { id: 'r1', status: ReportStatus.PUBLISHED, authorId: AUTHOR.sub };
    const service = new MeTooService(makePrisma(report, { createFails: true }) as never, makeRevalidate() as never);
    await expect(service.create('r1', {}, VOTER)).rejects.toThrow(ConflictException);
  });

  it('404s removing a me-too that does not exist', async () => {
    const report = { id: 'r1', status: ReportStatus.PUBLISHED, authorId: AUTHOR.sub };
    const service = new MeTooService(makePrisma(report) as never, makeRevalidate() as never);
    await expect(service.remove('r1', VOTER)).rejects.toThrow(NotFoundException);
  });

  it('removes an existing me-too', async () => {
    const report = { id: 'r1', status: ReportStatus.PUBLISHED, authorId: AUTHOR.sub };
    const prisma = makePrisma(report, { existing: { id: 'mt1' } });
    const service = new MeTooService(prisma as never, makeRevalidate() as never);
    await expect(service.remove('r1', VOTER)).resolves.toEqual({ removed: true });
    expect(prisma.reportComment.delete).toHaveBeenCalledWith({ where: { id: 'mt1' } });
  });
});
