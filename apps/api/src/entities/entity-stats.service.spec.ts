import { ReportStatus } from '@prisma/client';
import { EntityStatsService } from './entity-stats.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

function buildPrismaMock() {
  return {
    report: { findMany: vi.fn() },
    entityStats: { upsert: vi.fn() },
  };
}

describe('EntityStatsService', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let service: EntityStatsService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new EntityStatsService(prisma as unknown as PrismaService);
  });

  it('computes rates and averages from the entity\'s reports', async () => {
    const base = new Date('2026-01-01T00:00:00.000Z');
    prisma.report.findMany.mockResolvedValue([
      {
        createdAt: base,
        status: ReportStatus.RESOLVED,
        satisfactionRating: 5,
        responses: [{ createdAt: new Date(base.getTime() + 2 * 3_600_000) }], // 2h response
      },
      {
        createdAt: base,
        status: ReportStatus.PUBLISHED,
        satisfactionRating: null,
        responses: [{ createdAt: new Date(base.getTime() + 4 * 3_600_000) }], // 4h response
      },
      {
        createdAt: base,
        status: ReportStatus.PENDING,
        satisfactionRating: null,
        responses: [],
      },
    ]);

    await service.recomputeStats('entity-1');

    expect(prisma.entityStats.upsert).toHaveBeenCalledOnce();
    const { create } = prisma.entityStats.upsert.mock.calls[0][0];
    expect(create.totalReports).toBe(3);
    expect(create.respondedReports).toBe(2);
    expect(create.resolvedReports).toBe(1);
    expect(create.responseRatePct).toBeCloseTo((2 / 3) * 100);
    expect(create.resolutionRatePct).toBeCloseTo((1 / 3) * 100);
    expect(create.avgResponseHours).toBeCloseTo(3); // (2h + 4h) / 2
    expect(create.avgSatisfaction).toBe(5);
  });

  it('returns zero rates and null averages for an entity with no reports', async () => {
    prisma.report.findMany.mockResolvedValue([]);

    await service.recomputeStats('entity-empty');

    const { create } = prisma.entityStats.upsert.mock.calls[0][0];
    expect(create.totalReports).toBe(0);
    expect(create.responseRatePct).toBe(0);
    expect(create.resolutionRatePct).toBe(0);
    expect(create.avgResponseHours).toBeNull();
    expect(create.avgSatisfaction).toBeNull();
  });
});
