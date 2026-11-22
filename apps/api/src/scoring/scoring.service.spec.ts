import { ScoringService } from './scoring.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

function buildPrismaMock() {
  return {
    entity: { findUnique: vi.fn() },
    report: { findMany: vi.fn() },
  };
}

const BASE_ENTITY = { foundedAt: null, coin: null, exchange: null, wallet: null };

describe('ScoringService.gatherInputs', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let service: ScoringService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new ScoringService(prisma as unknown as PrismaService);
  });

  it('returns null when the entity does not exist', async () => {
    prisma.entity.findUnique.mockResolvedValue(null);
    const result = await service.gatherInputs('missing');
    expect(result).toBeNull();
    expect(prisma.report.findMany).not.toHaveBeenCalled();
  });

  it('counts qualifying reports but returns null ratios when there are none', async () => {
    prisma.entity.findUnique.mockResolvedValue(BASE_ENTITY);
    prisma.report.findMany.mockResolvedValue([]);

    const result = await service.gatherInputs('e1');
    expect(result?.complaints).toEqual({
      qualifyingReportCount: 0,
      chainVerifiedRatio: null,
      brandResponseRatio: null,
      resolutionRatio: null,
    });
  });

  it('dedupes by author before computing any complaint metric (anti-manipulation)', async () => {
    prisma.entity.findUnique.mockResolvedValue(BASE_ENTITY);
    // Same author files 3 "qualifying" reports; a different author files 1.
    // Only one report per author should count.
    prisma.report.findMany.mockResolvedValue([
      { authorId: 'spammer', status: 'PUBLISHED', evidences: [{ verifiedOnChain: false }], responses: [] },
      { authorId: 'spammer', status: 'RESOLVED', evidences: [{ verifiedOnChain: true }], responses: [{ id: 'r1' }] },
      { authorId: 'spammer', status: 'RESOLVED', evidences: [{ verifiedOnChain: true }], responses: [{ id: 'r2' }] },
      { authorId: 'genuine', status: 'PUBLISHED', evidences: [{ verifiedOnChain: false }], responses: [] },
    ]);

    const result = await service.gatherInputs('e1');
    expect(result?.complaints.qualifyingReportCount).toBe(2);
  });

  it('keeps the earliest report per author (orderBy createdAt asc + first-seen dedup)', async () => {
    prisma.entity.findUnique.mockResolvedValue(BASE_ENTITY);
    prisma.report.findMany.mockResolvedValue([
      // findMany is mocked to already reflect orderBy: createdAt asc — the
      // service filters in array order, keeping the first-seen (earliest).
      { authorId: 'author-1', status: 'PUBLISHED', evidences: [{ verifiedOnChain: false }], responses: [] }, // kept (first)
      { authorId: 'author-1', status: 'RESOLVED', evidences: [{ verifiedOnChain: true }], responses: [{ id: 'r' }] }, // dropped
    ]);

    const result = await service.gatherInputs('e1');
    // Resolution ratio reflects the KEPT (first) report's status, not the
    // later duplicate that happens to look more favorable.
    expect(result?.complaints.resolutionRatio).toBe(0);
  });

  it('computes chainVerifiedRatio/brandResponseRatio/resolutionRatio over the deduped qualifying set', async () => {
    prisma.entity.findUnique.mockResolvedValue(BASE_ENTITY);
    prisma.report.findMany.mockResolvedValue([
      { authorId: 'a', status: 'RESOLVED', evidences: [{ verifiedOnChain: true }], responses: [{ id: 'r' }] },
      { authorId: 'b', status: 'PUBLISHED', evidences: [{ verifiedOnChain: false }], responses: [] },
    ]);

    const result = await service.gatherInputs('e1');
    expect(result?.complaints.qualifyingReportCount).toBe(2);
    expect(result?.complaints.chainVerifiedRatio).toBeCloseTo(0.5);
    expect(result?.complaints.brandResponseRatio).toBeCloseTo(0.5);
    expect(result?.complaints.resolutionRatio).toBeCloseTo(0.5);
  });

  it('counts a DISPUTED-but-never-RESOLVED report as a response without crediting resolution', async () => {
    prisma.entity.findUnique.mockResolvedValue(BASE_ENTITY);
    prisma.report.findMany.mockResolvedValue([
      // A brand disputes (so it has a response) but the report stays
      // DISPUTED, never RESOLVED — disputing alone must not look like a
      // resolution.
      { authorId: 'a', status: 'DISPUTED', evidences: [{ verifiedOnChain: false }], responses: [{ id: 'dispute-reply' }] },
    ]);

    const result = await service.gatherInputs('e1');
    expect(result?.complaints.brandResponseRatio).toBe(1);
    expect(result?.complaints.resolutionRatio).toBe(0);
  });

  it('computes entityAgeDays from foundedAt, null when unset', async () => {
    prisma.report.findMany.mockResolvedValue([]);

    prisma.entity.findUnique.mockResolvedValue({ ...BASE_ENTITY, foundedAt: null });
    expect((await service.gatherInputs('e1'))?.entityAgeDays).toBeNull();

    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    prisma.entity.findUnique.mockResolvedValue({ ...BASE_ENTITY, foundedAt: tenDaysAgo });
    expect((await service.gatherInputs('e2'))?.entityAgeDays).toBe(10);
  });

  it('marks COIN contract fields unavailable (null) when no ContractAudit exists yet', async () => {
    prisma.report.findMany.mockResolvedValue([]);
    prisma.entity.findUnique.mockResolvedValue({ ...BASE_ENTITY, coin: { audits: [] } });

    const result = await service.gatherInputs('e1');
    expect(result?.contract).toEqual({
      isHoneypot: null,
      liquidityLocked: null,
      top10HolderPct: null,
      sellTaxPct: null,
      ownerRenounced: null,
    });
  });

  it('converts Decimal contract fields to plain numbers', async () => {
    prisma.report.findMany.mockResolvedValue([]);
    prisma.entity.findUnique.mockResolvedValue({
      ...BASE_ENTITY,
      coin: {
        audits: [
          {
            isHoneypot: false,
            liquidityLocked: true,
            top10HolderPct: { toNumber: () => 42 },
            sellTaxPct: { toNumber: () => 3 },
            ownerRenounced: true,
          },
        ],
      },
    });

    const result = await service.gatherInputs('e1');
    expect(result?.contract?.top10HolderPct).toBe(42);
    expect(result?.contract?.sellTaxPct).toBe(3);
  });

  it('derives wallet "audited" and "hasOfficialSellers" as always-available booleans once a WalletProfile exists', async () => {
    prisma.report.findMany.mockResolvedValue([]);
    prisma.entity.findUnique.mockResolvedValue({
      ...BASE_ENTITY,
      wallet: { openSource: null, auditedBy: null, kind: 'MOBILE', secureElement: null, officialSellers: [] },
    });

    const result = await service.gatherInputs('e1');
    expect(result?.wallet).toEqual({
      openSource: null,
      audited: false, // no profile data is missing — "not audited" is a real answer
      isHardware: false,
      secureElement: null,
      hasOfficialSellers: false,
    });
  });

  it('only treats a wallet as eligible for SECURE_ELEMENT when kind is HARDWARE', async () => {
    prisma.report.findMany.mockResolvedValue([]);
    prisma.entity.findUnique.mockResolvedValue({
      ...BASE_ENTITY,
      wallet: { openSource: true, auditedBy: 'Firm', kind: 'HARDWARE', secureElement: true, officialSellers: ['x'] },
    });

    const result = await service.gatherInputs('e1');
    expect(result?.wallet?.isHardware).toBe(true);
    expect(result?.wallet?.secureElement).toBe(true);
    expect(result?.wallet?.audited).toBe(true);
    expect(result?.wallet?.hasOfficialSellers).toBe(true);
  });
});
