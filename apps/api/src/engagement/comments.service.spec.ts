import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common';
import { ReportStatus, Role } from '@prisma/client';
import { CommentsService } from './comments.service.js';
import type { JwtPayload } from '../common/types/jwt-payload.interface.js';

const AUTHOR: JwtPayload = { sub: 'author-1', role: Role.USER };
const COMMENTER: JwtPayload = { sub: 'commenter-1', role: Role.USER };

function makePrisma(opts: {
  report?: { id: string; status: ReportStatus; authorId: string } | null;
  commentCount?: number;
  accountCreatedAt?: Date;
}) {
  const report = opts.report ?? { id: 'r1', status: ReportStatus.PUBLISHED, authorId: AUTHOR.sub };
  return {
    report: { findUnique: vi.fn().mockResolvedValue(report) },
    user: { findUnique: vi.fn().mockResolvedValue({ createdAt: opts.accountCreatedAt ?? new Date(0) }) },
    reportComment: {
      count: vi.fn().mockResolvedValue(opts.commentCount ?? 0),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'c1', ...data, user: { handle: 'commenter' } }),
      ),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    moderationLog: { create: vi.fn() },
    $transaction: vi.fn().mockImplementation((ops: unknown[]) => Promise.resolve(ops)),
  };
}

function makeRevalidate() {
  return { revalidate: vi.fn().mockResolvedValue(undefined) };
}

describe('CommentsService.create', () => {
  it('404s when the report is not visible (e.g. PENDING) to this user', async () => {
    const prisma = makePrisma({ report: { id: 'r1', status: ReportStatus.PENDING, authorId: 'someone-else' } });
    const service = new CommentsService(prisma as never, makeRevalidate() as never);
    await expect(service.create('r1', { body: 'hello there' }, COMMENTER)).rejects.toThrow(NotFoundException);
  });

  it('rejects a body with more than 2 URLs', async () => {
    const prisma = makePrisma({});
    const service = new CommentsService(prisma as never, makeRevalidate() as never);
    const body = 'see https://a.example and https://b.example and https://c.example';
    await expect(service.create('r1', { body }, COMMENTER)).rejects.toThrow(BadRequestException);
    expect(prisma.reportComment.create).not.toHaveBeenCalled();
  });

  it('accepts a body with exactly 2 URLs', async () => {
    const prisma = makePrisma({});
    const service = new CommentsService(prisma as never, makeRevalidate() as never);
    const body = 'see https://a.example and https://b.example';
    await expect(service.create('r1', { body }, COMMENTER)).resolves.toMatchObject({ isMeToo: false });
  });

  it('allows the report author to comment on their own report', async () => {
    const prisma = makePrisma({});
    const service = new CommentsService(prisma as never, makeRevalidate() as never);
    await expect(service.create('r1', { body: 'my own update' }, AUTHOR)).resolves.toMatchObject({
      isReportAuthor: true,
    });
  });

  it('429s once the daily quota (30) is reached for an established account', async () => {
    const prisma = makePrisma({ commentCount: 30, accountCreatedAt: new Date(0) });
    const service = new CommentsService(prisma as never, makeRevalidate() as never);
    await expect(service.create('r1', { body: 'one more' }, COMMENTER)).rejects.toThrow(HttpException);
    try {
      await service.create('r1', { body: 'one more' }, COMMENTER);
    } catch (err) {
      expect((err as HttpException).getStatus()).toBe(429);
    }
  });

  it('429s a new account (<24h old) once its lower daily quota (5) is reached', async () => {
    const prisma = makePrisma({ commentCount: 5, accountCreatedAt: new Date() });
    const service = new CommentsService(prisma as never, makeRevalidate() as never);
    await expect(service.create('r1', { body: 'one more' }, COMMENTER)).rejects.toThrow(HttpException);
  });

  it('allows a new account under its lower quota', async () => {
    const prisma = makePrisma({ commentCount: 4, accountCreatedAt: new Date() });
    const service = new CommentsService(prisma as never, makeRevalidate() as never);
    await expect(service.create('r1', { body: 'still fine' }, COMMENTER)).resolves.toBeDefined();
  });
});
