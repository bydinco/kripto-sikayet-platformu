import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CommentsService } from './comments.service.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';
import { RemoveCommentDto } from './dto/remove-comment.dto.js';
import { COMMENT_THROTTLE } from './engagement.constants.js';
import { OptionalAuth } from '../common/decorators/optional-auth.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../common/types/jwt-payload.interface.js';

@ApiTags('engagement')
@Controller('reports/:reportId/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Throttle(COMMENT_THROTTLE)
  @Post()
  create(
    @Param('reportId') reportId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.commentsService.create(reportId, dto, currentUser);
  }

  @OptionalAuth()
  @Get()
  findAll(
    @Param('reportId') reportId: string,
    @CurrentUser() currentUser?: JwtPayload,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ) {
    return this.commentsService.findAll(reportId, currentUser, {
      limit: limit ? Number(limit) : undefined,
      page: page ? Number(page) : undefined,
    });
  }

  // Self-removal (own comment, no reason) and MODERATOR/ADMIN hiding
  // (mandatory reason) both go through here — see CommentsService.remove.
  @Delete(':commentId')
  remove(
    @Param('reportId') reportId: string,
    @Param('commentId') commentId: string,
    @Body() dto: RemoveCommentDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.commentsService.remove(reportId, commentId, dto, currentUser);
  }
}
