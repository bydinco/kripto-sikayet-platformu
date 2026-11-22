import { Module } from '@nestjs/common';
import { ScoringService } from './scoring.service.js';
import { ScoringController } from './scoring.controller.js';
import { RiskScoreCronService } from './risk-score-cron.service.js';
import { RevalidateModule } from '../revalidate/revalidate.module.js';

@Module({
  imports: [RevalidateModule],
  controllers: [ScoringController],
  providers: [ScoringService, RiskScoreCronService],
  exports: [ScoringService],
})
export class ScoringModule {}
