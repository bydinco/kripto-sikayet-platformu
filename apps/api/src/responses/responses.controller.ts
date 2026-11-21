import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ResponsesService } from './responses.service.js';
import { CreateResponseDto } from './dto/create-response.dto.js';
import { Public } from '../common/decorators/public.decorator.js';
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

  @Public()
  @Get()
  findAll(@Param('reportId') reportId: string) {
    return this.responsesService.findAll(reportId);
  }
}
