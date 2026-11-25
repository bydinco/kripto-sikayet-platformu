import { Module } from '@nestjs/common';
import { VotesController } from './votes.controller.js';
import { VotesService } from './votes.service.js';
import { MeTooController } from './me-too.controller.js';
import { MeTooService } from './me-too.service.js';
import { CommentsController } from './comments.controller.js';
import { CommentsService } from './comments.service.js';
import { EngagementSummaryController } from './engagement-summary.controller.js';
import { EngagementSummaryService } from './engagement-summary.service.js';
import { RevalidateModule } from '../revalidate/revalidate.module.js';

@Module({
  imports: [RevalidateModule],
  controllers: [VotesController, MeTooController, CommentsController, EngagementSummaryController],
  providers: [VotesService, MeTooService, CommentsService, EngagementSummaryService],
})
export class EngagementModule {}
