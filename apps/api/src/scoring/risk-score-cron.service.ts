import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { ScoringService } from './scoring.service.js';

// Keeps every entity's risk score fresh even without a triggering event,
// since the complaint-based factors are windowed to "the last 90 days" —
// a report sliding out of that window should eventually lower the score
// again on its own, not just stay frozen at whatever it was when it fell
// inside the window.
//
// Arbitrary fixed key for this one job's Postgres advisory lock — not
// derived from anything, just needs to be stable and unique to this job
// so two API instances never both run the full recompute at once. No
// Redis client exists in this API yet (REDIS_URL is configured but unused
// elsewhere), so this reuses the Postgres connection already in place
// rather than adding a new runtime dependency for one lock.
const ADVISORY_LOCK_KEY = 918_273_645;

@Injectable()
export class RiskScoreCronService {
  private readonly logger = new Logger(RiskScoreCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async recomputeAll(): Promise<void> {
    const [{ locked }] = await this.prisma.$queryRaw<
      [{ locked: boolean }]
    >`SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) as locked`;

    if (!locked) {
      this.logger.log('Günlük risk skoru işi başka bir instance tarafından çalıştırılıyor, atlanıyor.');
      return;
    }

    try {
      const entities = await this.prisma.entity.findMany({ select: { id: true } });
      for (const entity of entities) {
        // safeRecomputeScore never throws — one bad entity never aborts the rest.
        await this.scoring.safeRecomputeScore(entity.id);
      }
      this.logger.log(`Günlük risk skoru işi tamamlandı: ${entities.length} varlık.`);
    } finally {
      await this.prisma.$queryRaw`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`;
    }
  }
}
