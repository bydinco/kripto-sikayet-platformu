import { Module } from '@nestjs/common';
import { EntitiesService } from './entities.service.js';
import { EntitiesController } from './entities.controller.js';
import { EntityStatsService } from './entity-stats.service.js';
import { ScoringModule } from '../scoring/scoring.module.js';

@Module({
  imports: [ScoringModule],
  controllers: [EntitiesController],
  providers: [EntitiesService, EntityStatsService],
  exports: [EntityStatsService],
})
export class EntitiesModule {}
