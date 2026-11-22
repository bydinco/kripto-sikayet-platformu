import { RiskLevel } from '@prisma/client';
import { computeRiskScore, CONFIDENCE_THRESHOLD, type RiskEngineInputs, type RiskModelLike } from './risk-score-engine.js';

const NO_COMPLAINTS: RiskEngineInputs['complaints'] = {
  qualifyingReportCount: 0,
  chainVerifiedRatio: null,
  brandResponseRatio: null,
  resolutionRatio: null,
};

function baseInputs(overrides: Partial<RiskEngineInputs> = {}): RiskEngineInputs {
  return { entityAgeDays: null, complaints: NO_COMPLAINTS, ...overrides };
}

const COIN_MODEL: RiskModelLike = {
  factors: [
    { code: 'HONEYPOT', maxPoints: 20 },
    { code: 'LIQUIDITY_LOCK', maxPoints: 15 },
    { code: 'TOP10_HOLDERS', maxPoints: 10 },
    { code: 'SELL_TAX', maxPoints: 10 },
    { code: 'OWNERSHIP', maxPoints: 5 },
    { code: 'REPORT_RATE', maxPoints: 15 },
    { code: 'CHAIN_VERIFIED_RATIO', maxPoints: 10 },
    { code: 'BRAND_RESPONSE', maxPoints: 5 },
    { code: 'RESOLUTION', maxPoints: 5 },
    { code: 'ENTITY_AGE', maxPoints: 5 },
  ],
};

describe('computeRiskScore — determinism', () => {
  it('returns identical output for identical input, called repeatedly', () => {
    const inputs = baseInputs({
      entityAgeDays: 400,
      complaints: { qualifyingReportCount: 2, chainVerifiedRatio: 0.5, brandResponseRatio: 0.5, resolutionRatio: 0.5 },
      contract: { isHoneypot: false, liquidityLocked: true, top10HolderPct: 30, sellTaxPct: 2, ownerRenounced: true },
    });
    const a = computeRiskScore(COIN_MODEL, inputs);
    const b = computeRiskScore(COIN_MODEL, inputs);
    expect(a).toEqual(b);
  });
});

describe('computeRiskScore — missing data', () => {
  it('marks a factor unavailable and lowers confidence when its data is absent', () => {
    const withData = computeRiskScore(
      COIN_MODEL,
      baseInputs({
        entityAgeDays: 400,
        complaints: { qualifyingReportCount: 0, chainVerifiedRatio: null, brandResponseRatio: null, resolutionRatio: null },
        contract: { isHoneypot: false, liquidityLocked: true, top10HolderPct: 10, sellTaxPct: 0, ownerRenounced: true },
      }),
    );
    const withoutContract = computeRiskScore(
      COIN_MODEL,
      baseInputs({
        entityAgeDays: 400,
        complaints: { qualifyingReportCount: 0, chainVerifiedRatio: null, brandResponseRatio: null, resolutionRatio: null },
      }),
    );

    expect(withData.confidence).toBeGreaterThan(withoutContract.confidence);
    const honeypot = withoutContract.factors.find((f) => f.code === 'HONEYPOT');
    expect(honeypot?.available).toBe(false);
    expect(honeypot?.points).toBe(0);
  });

  it('returns INSUFFICIENT_DATA with score=null when confidence is below the threshold', () => {
    const result = computeRiskScore(COIN_MODEL, baseInputs());
    expect(result.confidence).toBeLessThan(CONFIDENCE_THRESHOLD);
    expect(result.level).toBe(RiskLevel.INSUFFICIENT_DATA);
    expect(result.score).toBeNull();
  });

  it('never returns INSUFFICIENT_DATA once enough factors are available, even at 0 risk', () => {
    const result = computeRiskScore(
      COIN_MODEL,
      baseInputs({
        entityAgeDays: 1000,
        complaints: { qualifyingReportCount: 0, chainVerifiedRatio: 1, brandResponseRatio: 1, resolutionRatio: 1 },
        contract: { isHoneypot: false, liquidityLocked: true, top10HolderPct: 0, sellTaxPct: 0, ownerRenounced: true },
      }),
    );
    expect(result.level).toBe(RiskLevel.LOW);
    expect(result.score).toBe(0);
  });
});

describe('computeRiskScore — thresholds', () => {
  const MODEL: RiskModelLike = { factors: [{ code: 'HONEYPOT', maxPoints: 100 }] };

  it.each([
    [false, RiskLevel.LOW],
    [true, RiskLevel.CRITICAL_SIGNAL],
  ])('isHoneypot=%s -> %s', (isHoneypot, level) => {
    const result = computeRiskScore(
      MODEL,
      baseInputs({ contract: { isHoneypot, liquidityLocked: null, top10HolderPct: null, sellTaxPct: null, ownerRenounced: null } }),
    );
    expect(result.level).toBe(level);
  });

  it('lands on MEDIUM and HIGH_RISK_SIGNAL at the expected boundaries', () => {
    const weighted: RiskModelLike = { factors: [{ code: 'TOP10_HOLDERS', maxPoints: 100 }] };
    const medium = computeRiskScore(
      weighted,
      baseInputs({ contract: { isHoneypot: null, liquidityLocked: null, top10HolderPct: 40, sellTaxPct: null, ownerRenounced: null } }),
    );
    expect(medium.score).toBe(40);
    expect(medium.level).toBe(RiskLevel.MEDIUM);

    const high = computeRiskScore(
      weighted,
      baseInputs({ contract: { isHoneypot: null, liquidityLocked: null, top10HolderPct: 60, sellTaxPct: null, ownerRenounced: null } }),
    );
    expect(high.score).toBe(60);
    expect(high.level).toBe(RiskLevel.HIGH_RISK_SIGNAL);
  });
});

describe('computeRiskScore — manipulation resistance', () => {
  it('caps BRAND_RESPONSE and RESOLUTION contributions at the model-defined weight (<=10% in the seeded models)', () => {
    // Even at maximum risk (0% response, 0% resolution), these two factors
    // alone cannot push the score far, because their combined maxPoints is
    // small in the real seeded models (5+5=10 for COIN).
    const result = computeRiskScore(
      COIN_MODEL,
      baseInputs({
        entityAgeDays: 1000,
        complaints: { qualifyingReportCount: 0, chainVerifiedRatio: 1, brandResponseRatio: 0, resolutionRatio: 0 },
        contract: { isHoneypot: false, liquidityLocked: true, top10HolderPct: 0, sellTaxPct: 0, ownerRenounced: true },
      }),
    );
    // Only BRAND_RESPONSE(5) + RESOLUTION(5) = 10 of 100 points at risk here.
    expect(result.score).toBeLessThanOrEqual(10);
  });

  it('disputing a report cannot by itself improve the resolution factor (engine-level: a non-RESOLVED ratio stays <1)', () => {
    // resolutionRatio=0 here simulates "disputed but never actually
    // resolved" — the fraction stays at max risk (1), proving a dispute
    // alone cannot masquerade as a resolution at the engine level.
    const disputedNotResolved = computeRiskScore(
      COIN_MODEL,
      baseInputs({ complaints: { qualifyingReportCount: 1, chainVerifiedRatio: 1, brandResponseRatio: 1, resolutionRatio: 0 } }),
    );
    const resolutionFactor = disputedNotResolved.factors.find((f) => f.code === 'RESOLUTION');
    expect(resolutionFactor?.points).toBe(5); // full risk weight for RESOLUTION, unreduced
  });
});
