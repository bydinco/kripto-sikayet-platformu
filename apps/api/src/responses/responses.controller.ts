import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ResponsesService } from './responses.service.js';
import { CreateResponseDto } from './dto/create-response.dto.js';
import { OptionalAuth } from '../common/decorators/optional-auth.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../common/types/jwt-payload.interface.js';

// No PATCH/DELETE: a brand's reply is append-only, never edited in place.
@ApiTags('responses')
@Controller('reports/:reportId/responses')
export class ResponsesController {
  constructor(private readonly responsesService: ResponsesService) {}

  @Post()
  create(
    @Param('reportId') reportId: string,
    @Body() dto: CreateResponseDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.responsesService.create(reportId, dto, currentUser);
  }

  @OptionalAuth()
  @Get()
  findAll(@Param('reportId') reportId: string, @CurrentUser() currentUser?: JwtPayload) {
    return this.responsesService.findAll(reportId, currentUser);
  }
}
