import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EngagementSummaryService } from './engagement-summary.service.js';
import { OptionalAuth } from '../common/decorators/optional-auth.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../common/types/jwt-payload.interface.js';

@ApiTags('engagement')
@Controller('reports/:reportId/engagement')
export class EngagementSummaryController {
  constructor(private readonly engagementSummaryService: EngagementSummaryService) {}

  @OptionalAuth()
  @Get()
  summary(@Param('reportId') reportId: string, @CurrentUser() currentUser?: JwtPayload) {
    return this.engagementSummaryService.summary(reportId, currentUser);
  }
}
