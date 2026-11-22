import { RiskLevel } from '@prisma/client';

// Pure, deterministic risk scoring. No database access here — gatherInputs()
// in scoring.service.ts does all the Prisma work and hands this function a
// plain data object. Same inputs always produce the same output.
//
// Entity.verified is deliberately absent from RiskEngineInputs below: it is
// structurally impossible for this function to use it (see
// scoring-verified-neutral.e2e-spec.ts for the end-to-end guarantee).

export interface ComplaintAggregates {
  // Distinct-author qualifying reports (status PUBLISHED/DISPUTED/RESOLVED,
  // createdAt within the last 90 days, >=1 approved evidence), deduped to
  // one report per author before any of these are computed — see
  // gatherInputs() for why.
  qualifyingReportCount: number;
  // Ratio of approved evidence (within the qualifying set) verified
  // on-chain. null when there is no approved evidence to measure.
  chainVerifiedRatio: number | null;
  // Fraction of qualifying reports with >=1 EntityResponse of any kind
  // (a brand's dispute counts as engagement, same as a non-dispute reply).
  // null when there are no qualifying reports.
  brandResponseRatio: number | null;
  // Fraction of qualifying reports with status === RESOLVED. A DISPUTED
  // report that is never actually resolved does NOT count here, so merely
  // disputing a complaint cannot inflate this on its own.
  resolutionRatio: number | null;
}

export interface ContractAuditInputs {
  isHoneypot: boolean | null;
  liquidityLocked: boolean | null;
  top10HolderPct: number | null;
  sellTaxPct: number | null;
  ownerRenounced: boolean | null;
}

export interface ExchangeProfileInputs {
  licensed: boolean | null;
  proofOfReserves: boolean | null;
}

export interface WalletProfileInputs {
  openSource: boolean | null;
  // Derived from auditedBy: null only when there is no WalletProfile row at
  // all (genuinely unknown); once a profile exists, an empty auditedBy is a
  // real "not audited" answer (false), not missing data.
  audited: boolean | null;
  isHardware: boolean;
  secureElement: boolean | null;
  hasOfficialSellers: boolean | null;
}

export interface RiskEngineInputs {
  // null when Entity.foundedAt is unset — never backfilled from createdAt,
  // which only reflects when we catalogued it, not when it was founded.
  entityAgeDays: number | null;
  complaints: ComplaintAggregates;
  contract?: ContractAuditInputs; // COIN
  exchange?: ExchangeProfileInputs; // EXCHANGE
  wallet?: WalletProfileInputs; // WALLET
}

export interface RiskFactorDefLike {
  code: string;
  maxPoints: number;
}

export interface RiskModelLike {
  factors: RiskFactorDefLike[];
}

export interface FactorResult {
  code: string;
  available: boolean;
  points: number; // 0..maxPoints, 0 when unavailable
  rawValue: string | null;
  note: string | null;
}

export interface RiskScoreResult {
  score: number | null; // null when level is INSUFFICIENT_DATA
  level: RiskLevel;
  confidence: number; // 0-100
  factors: FactorResult[];
}

interface FactorEvaluation {
  available: boolean;
  fraction: number; // 0..1 risk contribution, meaningful only if available
  rawValue: string | null;
  note: string | null;
}

type FactorEvaluator = (inputs: RiskEngineInputs) => FactorEvaluation;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

const UNAVAILABLE: FactorEvaluation = { available: false, fraction: 0, rawValue: null, note: null };

// Shared across COIN/EXCHANGE/WALLET.
const REPORT_RATE: FactorEvaluator = (inputs) => {
  const count = inputs.complaints.qualifyingReportCount;
  return {
    available: true, // a count of 0 is real data, not missing data
    fraction: clamp01(count / 5), // draft: 5+ distinct-author reports in 90d = max risk
    rawValue: String(count),
    note: `Son 90 günde ${count} bağımsız yazardan nitelikli şikayet`,
  };
};

const CHAIN_VERIFIED_RATIO: FactorEvaluator = (inputs) => {
  const ratio = inputs.complaints.chainVerifiedRatio;
  if (ratio === null) return UNAVAILABLE;
  return {
    available: true,
    fraction: clamp01(1 - ratio),
    rawValue: `${Math.round(ratio * 100)}%`,
    note: 'Zincir üstü doğrulanmış kanıt oranı (düşük oran = yüksek risk)',
  };
};

const BRAND_RESPONSE: FactorEvaluator = (inputs) => {
  const ratio = inputs.complaints.brandResponseRatio;
  if (ratio === null) return UNAVAILABLE;
  return {
    available: true,
    fraction: clamp01(1 - ratio),
    rawValue: `${Math.round(ratio * 100)}%`,
    note: 'Yanıtlanan benzersiz şikayet oranı (yanıt sayısı/hızı değil)',
  };
};

const RESOLUTION: FactorEvaluator = (inputs) => {
  const ratio = inputs.complaints.resolutionRatio;
  if (ratio === null) return UNAVAILABLE;
  return {
    available: true,
    fraction: clamp01(1 - ratio),
    rawValue: `${Math.round(ratio * 100)}%`,
    note: 'Çözülmüş şikayet oranı (itiraz tek başına bunu artırmaz)',
  };
};

const ENTITY_AGE: FactorEvaluator = (inputs) => {
  const days = inputs.entityAgeDays;
  if (days === null) return UNAVAILABLE;
  const fraction = days < 180 ? 1 : days < 365 ? 0.6 : days < 730 ? 0.3 : 0;
  return { available: true, fraction, rawValue: `${days} gün`, note: 'Varlık yaşı (foundedAt)' };
};

// COIN — ContractAudit
const HONEYPOT: FactorEvaluator = (inputs) => {
  const v = inputs.contract?.isHoneypot;
  if (v === null || v === undefined) return UNAVAILABLE;
  return { available: true, fraction: v ? 1 : 0, rawValue: String(v), note: 'Honeypot taraması' };
};

const LIQUIDITY_LOCK: FactorEvaluator = (inputs) => {
  const v = inputs.contract?.liquidityLocked;
  if (v === null || v === undefined) return UNAVAILABLE;
  return { available: true, fraction: v ? 0 : 1, rawValue: String(v), note: 'Likidite kilidi' };
};

const TOP10_HOLDERS: FactorEvaluator = (inputs) => {
  const v = inputs.contract?.top10HolderPct;
  if (v === null || v === undefined) return UNAVAILABLE;
  return { available: true, fraction: clamp01(v / 100), rawValue: `${v}%`, note: 'İlk 10 cüzdanın sahiplik oranı' };
};

const SELL_TAX: FactorEvaluator = (inputs) => {
  const v = inputs.contract?.sellTaxPct;
  if (v === null || v === undefined) return UNAVAILABLE;
  return { available: true, fraction: clamp01(v / 20), rawValue: `${v}%`, note: 'Satış vergisi (taslak eşik: %20+)' };
};

const OWNERSHIP: FactorEvaluator = (inputs) => {
  const v = inputs.contract?.ownerRenounced;
  if (v === null || v === undefined) return UNAVAILABLE;
  return { available: true, fraction: v ? 0 : 1, rawValue: String(v), note: 'Sahiplik feragati' };
};

// EXCHANGE — ExchangeProfile
const LICENSE: FactorEvaluator = (inputs) => {
  const v = inputs.exchange?.licensed;
  if (v === null || v === undefined) return UNAVAILABLE;
  return { available: true, fraction: v ? 0 : 1, rawValue: String(v), note: 'Lisans durumu' };
};

const PROOF_OF_RESERVES: FactorEvaluator = (inputs) => {
  const v = inputs.exchange?.proofOfReserves;
  if (v === null || v === undefined) return UNAVAILABLE;
  return { available: true, fraction: v ? 0 : 1, rawValue: String(v), note: 'Rezerv kanıtı' };
};

// WALLET — WalletProfile
const OPEN_SOURCE: FactorEvaluator = (inputs) => {
  const v = inputs.wallet?.openSource;
  if (v === null || v === undefined) return UNAVAILABLE;
  return { available: true, fraction: v ? 0 : 1, rawValue: String(v), note: 'Açık kaynak' };
};

const AUDITED: FactorEvaluator = (inputs) => {
  const v = inputs.wallet?.audited;
  if (v === null || v === undefined) return UNAVAILABLE;
  return { available: true, fraction: v ? 0 : 1, rawValue: String(v), note: 'Bağımsız denetim' };
};

const SECURE_ELEMENT: FactorEvaluator = (inputs) => {
  if (!inputs.wallet?.isHardware) {
    return { available: false, fraction: 0, rawValue: null, note: 'Sadece donanım cüzdanlarına uygulanır' };
  }
  const v = inputs.wallet.secureElement;
  if (v === null || v === undefined) return UNAVAILABLE;
  return { available: true, fraction: v ? 0 : 1, rawValue: String(v), note: 'Güvenli eleman (secure element)' };
};

const OFFICIAL_SELLERS: FactorEvaluator = (inputs) => {
  const v = inputs.wallet?.hasOfficialSellers;
  if (v === null || v === undefined) return UNAVAILABLE;
  return { available: true, fraction: v ? 0 : 1, rawValue: String(v), note: 'Yetkili satış kanalı kaydı' };
};

export const FACTOR_EVALUATORS: Record<string, FactorEvaluator> = {
  REPORT_RATE,
  CHAIN_VERIFIED_RATIO,
  BRAND_RESPONSE,
  RESOLUTION,
  ENTITY_AGE,
  HONEYPOT,
  LIQUIDITY_LOCK,
  TOP10_HOLDERS,
  SELL_TAX,
  OWNERSHIP,
  LICENSE,
  PROOF_OF_RESERVES,
  OPEN_SOURCE,
  AUDITED,
  SECURE_ELEMENT,
  OFFICIAL_SELLERS,
};

// Draft — not calibrated against real-world outcomes yet.
export const CONFIDENCE_THRESHOLD = 40;

// Draft thresholds — not calibrated against real-world outcomes yet.
function levelForScore(score: number): RiskLevel {
  if (score < 25) return RiskLevel.LOW;
  if (score < 50) return RiskLevel.MEDIUM;
  if (score < 75) return RiskLevel.HIGH_RISK_SIGNAL;
  return RiskLevel.CRITICAL_SIGNAL;
}

export function computeRiskScore(model: RiskModelLike, inputs: RiskEngineInputs): RiskScoreResult {
  const totalMaxPoints = model.factors.reduce((sum, f) => sum + f.maxPoints, 0);

  const evaluated = model.factors.map((factor) => {
    const evaluator = FACTOR_EVALUATORS[factor.code];
    const result = evaluator ? evaluator(inputs) : { ...UNAVAILABLE, note: `Bilinmeyen faktör kodu: ${factor.code}` };
    return { factor, ...result };
  });

  const availableMaxPoints = evaluated.filter((e) => e.available).reduce((sum, e) => sum + e.factor.maxPoints, 0);
  const earnedPoints = evaluated
    .filter((e) => e.available)
    .reduce((sum, e) => sum + e.fraction * e.factor.maxPoints, 0);

  const confidence = totalMaxPoints > 0 ? Math.round((availableMaxPoints / totalMaxPoints) * 100) : 0;

  const factors: FactorResult[] = evaluated.map((e) => ({
    code: e.factor.code,
    available: e.available,
    points: e.available ? Math.round(e.fraction * e.factor.maxPoints * 100) / 100 : 0,
    rawValue: e.rawValue,
    note: e.note,
  }));

  if (confidence < CONFIDENCE_THRESHOLD || availableMaxPoints === 0) {
    return { score: null, level: RiskLevel.INSUFFICIENT_DATA, confidence, factors };
  }

  const score = Math.round((earnedPoints / availableMaxPoints) * 100);
  return { score, level: levelForScore(score), confidence, factors };
}
