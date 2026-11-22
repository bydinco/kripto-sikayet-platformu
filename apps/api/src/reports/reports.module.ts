import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service.js';
import { ReportsController } from './reports.controller.js';
import { EntitiesModule } from '../entities/entities.module.js';
import { ScoringModule } from '../scoring/scoring.module.js';
import { RevalidateModule } from '../revalidate/revalidate.module.js';

@Module({
  imports: [EntitiesModule, ScoringModule, RevalidateModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
