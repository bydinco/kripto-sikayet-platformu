import { Module } from '@nestjs/common';
import { EntitiesService } from './entities.service.js';
import { EntitiesController } from './entities.controller.js';
import { EntityStatsService } from './entity-stats.service.js';

@Module({
  controllers: [EntitiesController],
  providers: [EntitiesService, EntityStatsService],
  exports: [EntityStatsService],
})
export class EntitiesModule {}
