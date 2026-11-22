import { Module } from '@nestjs/common';
import { ScoringService } from './scoring.service.js';
import { ScoringController } from './scoring.controller.js';
import { RiskScoreCronService } from './risk-score-cron.service.js';

@Module({
  controllers: [ScoringController],
  providers: [ScoringService, RiskScoreCronService],
  exports: [ScoringService],
})
export class ScoringModule {}
