import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Role, ReportStatus, WalletKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateScoringDto } from './dto/create-scoring.dto.js';
import { UpdateScoringDto } from './dto/update-scoring.dto.js';
import { computeRiskScore, type RiskEngineInputs } from './risk-score-engine.js';
import type { JwtPayload } from '../common/types/jwt-payload.interface.js';

const QUALIFYING_STATUSES: ReportStatus[] = [ReportStatus.PUBLISHED, ReportStatus.DISPUTED, ReportStatus.RESOLVED];
const COMPLAINT_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isAdmin(currentUser?: JwtPayload): boolean {
  return currentUser?.role === Role.ADMIN;
}

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Callers (report/response/evidence transitions, the recompute endpoint,
  // the cron job) should never have their own operation fail just because
  // risk scoring did — this never throws, only logs.
  async safeRecomputeScore(entityId: string): Promise<void> {
    try {
      await this.recomputeScore(entityId);
    } catch (error) {
      this.logger.error(
        `recomputeScore failed for entity ${entityId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  // ───────────── raw RiskScore CRUD (manual override, ADMIN-gated at the
  // controller) — findAll/findOne below additionally hide scores computed
  // under an inactive model from non-ADMIN callers. ─────────────

  create(createScoringDto: CreateScoringDto) {
    return this.prisma.riskScore.create({ data: createScoringDto });
  }

  findAll(currentUser?: JwtPayload, entityId?: string) {
    return this.prisma.riskScore.findMany({
      where: {
        ...(entityId ? { entityId } : {}),
        ...(isAdmin(currentUser) ? {} : { model: { active: true } }),
      },
      include: { factors: { include: { factor: true } }, model: true },
      orderBy: { computedAt: 'desc' },
    });
  }

  async findOne(id: string, currentUser?: JwtPayload) {
    const score = await this.prisma.riskScore.findUnique({
      where: { id },
      include: { factors: { include: { factor: true } }, model: true },
    });
    if (!score || (!score.model.active && !isAdmin(currentUser))) {
      throw new NotFoundException('Risk skoru bulunamadı.');
    }
    return score;
  }

  update(id: string, updateScoringDto: UpdateScoringDto) {
    return this.prisma.riskScore.update({ where: { id }, data: updateScoringDto });
  }

  remove(id: string) {
    return this.prisma.riskScore.delete({ where: { id } });
  }

  // Public — "highest risk this week" on the homepage. Only ever draws
  // from entities whose model is active (same visibility rule as
  // findAll/findOne) and from each entity's CURRENT (latest) score, never
  // a stale historical high.
  async topRiskScores(take?: number) {
    // Pagination is mandatory, not optional — clamp regardless of what the
    // caller asks for, so this can never return an unbounded result as the
    // dataset grows.
    const safeTake = Number.isFinite(take) && take! > 0 ? Math.min(take!, 50) : 10;
    const latestPerEntity = await this.prisma.riskScore.findMany({
      where: { model: { active: true }, score: { not: null } },
      orderBy: [{ entityId: 'asc' }, { computedAt: 'desc' }],
      distinct: ['entityId'],
      include: {
        factors: { include: { factor: true } },
        model: true,
        entity: { select: { id: true, name: true, slug: true, type: true } },
      },
    });
    return latestPerEntity.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, safeTake);
  }

  // ───────────── risk model management (ADMIN-only at the controller) ─────────────

  listActiveModels() {
    return this.prisma.riskModel.findMany({
      where: { active: true },
      include: { factors: { orderBy: { maxPoints: 'desc' } } },
      orderBy: { entityType: 'asc' },
    });
  }

  async setModelActive(modelId: string, active: boolean) {
    const model = await this.prisma.riskModel.findUnique({ where: { id: modelId } });
    if (!model) {
      throw new NotFoundException('Risk modeli bulunamadı.');
    }

    if (active) {
      // Only one active version per entityType at a time.
      await this.prisma.$transaction([
        this.prisma.riskModel.updateMany({
          where: { entityType: model.entityType, active: true, NOT: { id: modelId } },
          data: { active: false },
        }),
        this.prisma.riskModel.update({
          where: { id: modelId },
          data: { active: true, publishedAt: model.publishedAt ?? new Date() },
        }),
      ]);
    } else {
      await this.prisma.riskModel.update({ where: { id: modelId }, data: { active: false } });
    }

    return this.prisma.riskModel.findUnique({ where: { id: modelId }, include: { factors: true } });
  }

  // ───────────── the engine itself ─────────────

  // Always uses the latest version of the model for the entity's type,
  // active or not — activation only gates PUBLIC visibility (findAll/
  // findOne above), not computation. That is deliberate: it lets ADMIN
  // review real scores from a draft model before ever flipping it active.
  // Returns null (quiet no-op) when the entity doesn't exist or no model
  // is defined yet for its type, so callers can fire this blindly.
  async recomputeScore(entityId: string) {
    const entity = await this.prisma.entity.findUnique({ where: { id: entityId }, select: { type: true } });
    if (!entity) return null;

    const model = await this.prisma.riskModel.findFirst({
      where: { entityType: entity.type },
      orderBy: { version: 'desc' },
      include: { factors: true },
    });
    if (!model) return null;

    const inputs = await this.gatherInputs(entityId);
    if (!inputs) return null; // entity vanished between the two lookups — benign race

    const result = computeRiskScore(model, inputs);
    const factorIdByCode = new Map(model.factors.map((f) => [f.code, f.id]));

    return this.prisma.riskScore.create({
      data: {
        entityId,
        modelId: model.id,
        score: result.score,
        level: result.level,
        confidence: result.confidence,
        factors: {
          create: result.factors
            .filter((f) => f.available)
            .map((f) => ({
              factorId: factorIdByCode.get(f.code)!,
              points: f.points,
              rawValue: f.rawValue,
              note: f.note,
            })),
        },
      },
      include: { factors: { include: { factor: true } }, model: true },
    });
  }

  // Exported for unit testing in isolation from recomputeScore/persistence.
  async gatherInputs(entityId: string): Promise<RiskEngineInputs | null> {
    const entity = await this.prisma.entity.findUnique({
      where: { id: entityId },
      include: {
        coin: { include: { audits: { orderBy: { scannedAt: 'desc' }, take: 1 } } },
        exchange: true,
        wallet: true,
      },
    });
    if (!entity) return null;

    const complaints = await this.gatherComplaintAggregates(entityId);
    const entityAgeDays = entity.foundedAt ? Math.floor((Date.now() - entity.foundedAt.getTime()) / MS_PER_DAY) : null;

    const inputs: RiskEngineInputs = { entityAgeDays, complaints };

    if (entity.coin) {
      const audit = entity.coin.audits[0];
      inputs.contract = audit
        ? {
            isHoneypot: audit.isHoneypot,
            liquidityLocked: audit.liquidityLocked,
            top10HolderPct: audit.top10HolderPct !== null ? audit.top10HolderPct.toNumber() : null,
            sellTaxPct: audit.sellTaxPct !== null ? audit.sellTaxPct.toNumber() : null,
            ownerRenounced: audit.ownerRenounced,
          }
        : { isHoneypot: null, liquidityLocked: null, top10HolderPct: null, sellTaxPct: null, ownerRenounced: null };
    }

    if (entity.exchange) {
      inputs.exchange = { licensed: entity.exchange.licensed, proofOfReserves: entity.exchange.proofOfReserves };
    }

    if (entity.wallet) {
      const wallet = entity.wallet;
      inputs.wallet = {
        openSource: wallet.openSource,
        // The profile row's mere existence means auditedBy was a real
        // answer (possibly "none"), not missing data — always available.
        audited: Boolean(wallet.auditedBy?.trim()),
        isHardware: wallet.kind === WalletKind.HARDWARE,
        secureElement: wallet.secureElement,
        hasOfficialSellers: wallet.officialSellers.length > 0,
      };
    }

    return inputs;
  }

  // Qualifying reports: PUBLISHED/DISPUTED/RESOLVED, created within the
  // last 90 days, with >=1 approved evidence — deduped to one report per
  // author (earliest) BEFORE computing any metric, so a single author
  // filing many reports can't inflate volume, response rate, resolution
  // rate, or the evidence-verification ratio.
  private async gatherComplaintAggregates(entityId: string) {
    const windowStart = new Date(Date.now() - COMPLAINT_WINDOW_MS);
    const reports = await this.prisma.report.findMany({
      where: {
        entityId,
        status: { in: QUALIFYING_STATUSES },
        createdAt: { gte: windowStart },
        evidences: { some: { approved: true } },
      },
      select: {
        authorId: true,
        status: true,
        evidences: { where: { approved: true }, select: { verifiedOnChain: true } },
        responses: { select: { id: true }, take: 1 },
      },
      orderBy: { createdAt: 'asc' },
    });

    const seenAuthors = new Set<string>();
    const deduped = reports.filter((r) => {
      if (seenAuthors.has(r.authorId)) return false;
      seenAuthors.add(r.authorId);
      return true;
    });

    const qualifyingReportCount = deduped.length;
    if (qualifyingReportCount === 0) {
      return { qualifyingReportCount: 0, chainVerifiedRatio: null, brandResponseRatio: null, resolutionRatio: null };
    }

    const approvedEvidence = deduped.flatMap((r) => r.evidences);
    const chainVerifiedRatio = approvedEvidence.length
      ? approvedEvidence.filter((e) => e.verifiedOnChain).length / approvedEvidence.length
      : null;

    // "Yanıtlanan benzersiz rapor oranı", not reply count/speed — a brand
    // can't buy down this factor by replying many times to the same report.
    const brandResponseRatio = deduped.filter((r) => r.responses.length > 0).length / qualifyingReportCount;
    const resolutionRatio = deduped.filter((r) => r.status === ReportStatus.RESOLVED).length / qualifyingReportCount;

    return { qualifyingReportCount, chainVerifiedRatio, brandResponseRatio, resolutionRatio };
  }
}
