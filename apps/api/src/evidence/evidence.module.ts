import { Module } from '@nestjs/common';
import { EvidenceService } from './evidence.service.js';
import { EvidenceController } from './evidence.controller.js';
import { EvidenceFileController } from './files/evidence-file.controller.js';
import { EvidenceFileService } from './files/evidence-file.service.js';
import { EvidenceFileAccessService } from './files/evidence-file-access.service.js';
import { ScoringModule } from '../scoring/scoring.module.js';
import { RevalidateModule } from '../revalidate/revalidate.module.js';
import { StorageModule } from '../storage/storage.module.js';

@Module({
  imports: [ScoringModule, RevalidateModule, StorageModule],
  controllers: [EvidenceController, EvidenceFileController],
  providers: [EvidenceService, EvidenceFileService, EvidenceFileAccessService],
})
export class EvidenceModule {}
