import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ReportStatus, Role } from '@prisma/client';
import { VotesService } from './votes.service.js';
import type { JwtPayload } from '../common/types/jwt-payload.interface.js';

const AUTHOR: JwtPayload = { sub: 'author-1', role: Role.USER };
const VOTER: JwtPayload = { sub: 'voter-1', role: Role.USER };

function makePrisma(report: { id: string; status: ReportStatus; authorId: string } | null, existingVote?: unknown) {
  return {
    report: { findUnique: vi.fn().mockResolvedValue(report) },
    reportVote: {
      upsert: vi.fn().mockImplementation(({ create }: { create: Record<string, unknown> }) =>
        Promise.resolve({ id: 'v1', ...create }),
      ),
      findUnique: vi.fn().mockResolvedValue(existingVote ?? null),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  };
}

function makeRevalidate() {
  return { revalidate: vi.fn().mockResolvedValue(undefined) };
}

describe('VotesService', () => {
  it('404s when the report does not exist', async () => {
    const service = new VotesService(makePrisma(null) as never, makeRevalidate() as never);
    await expect(service.create('missing', VOTER)).rejects.toThrow(NotFoundException);
  });

  it('404s when the report is not visible to this user (e.g. REJECTED, not the author)', async () => {
    const report = { id: 'r1', status: ReportStatus.REJECTED, authorId: AUTHOR.sub };
    const service = new VotesService(makePrisma(report) as never, makeRevalidate() as never);
    await expect(service.create('r1', VOTER)).rejects.toThrow(NotFoundException);
  });

  it('403s when the report author tries to vote on their own report', async () => {
    const report = { id: 'r1', status: ReportStatus.PUBLISHED, authorId: AUTHOR.sub };
    const service = new VotesService(makePrisma(report) as never, makeRevalidate() as never);
    await expect(service.create('r1', AUTHOR)).rejects.toThrow(ForbiddenException);
  });

  it('is idempotent: voting twice both times upserts helpful=true', async () => {
    const report = { id: 'r1', status: ReportStatus.PUBLISHED, authorId: AUTHOR.sub };
    const prisma = makePrisma(report);
    const service = new VotesService(prisma as never, makeRevalidate() as never);
    await service.create('r1', VOTER);
    await service.create('r1', VOTER);
    expect(prisma.reportVote.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.reportVote.upsert.mock.calls[0][0].update).toEqual({ helpful: true });
  });

  it('404s removing a vote that does not exist', async () => {
    const report = { id: 'r1', status: ReportStatus.PUBLISHED, authorId: AUTHOR.sub };
    const service = new VotesService(makePrisma(report) as never, makeRevalidate() as never);
    await expect(service.remove('r1', VOTER)).rejects.toThrow(NotFoundException);
  });

  it('removes an existing vote', async () => {
    const report = { id: 'r1', status: ReportStatus.PUBLISHED, authorId: AUTHOR.sub };
    const prisma = makePrisma(report, { id: 'v1' });
    const service = new VotesService(prisma as never, makeRevalidate() as never);
    await expect(service.remove('r1', VOTER)).resolves.toEqual({ removed: true });
    expect(prisma.reportVote.delete).toHaveBeenCalledWith({ where: { id: 'v1' } });
  });
});
