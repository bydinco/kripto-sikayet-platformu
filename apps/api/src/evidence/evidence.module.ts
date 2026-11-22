import { Module } from '@nestjs/common';
import { EvidenceService } from './evidence.service.js';
import { EvidenceController } from './evidence.controller.js';
import { ScoringModule } from '../scoring/scoring.module.js';

@Module({
  imports: [ScoringModule],
  controllers: [EvidenceController],
  providers: [EvidenceService],
})
export class EvidenceModule {}
