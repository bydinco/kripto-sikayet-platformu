import { Controller, Delete, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { VotesService } from './votes.service.js';
import { VOTE_THROTTLE } from './engagement.constants.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../common/types/jwt-payload.interface.js';

// "Faydalı oyu" — a single on/off toggle (ReportVote.helpful is always
// true; there is no "not helpful" value). Login required for both routes
// (no @OptionalAuth here).
@ApiTags('engagement')
@Controller('reports/:reportId/votes')
export class VotesController {
  constructor(private readonly votesService: VotesService) {}

  @Throttle(VOTE_THROTTLE)
  @Post()
  create(@Param('reportId') reportId: string, @CurrentUser() currentUser: JwtPayload) {
    return this.votesService.create(reportId, currentUser);
  }

  @Throttle(VOTE_THROTTLE)
  @Delete()
  remove(@Param('reportId') reportId: string, @CurrentUser() currentUser: JwtPayload) {
    return this.votesService.remove(reportId, currentUser);
  }
}
