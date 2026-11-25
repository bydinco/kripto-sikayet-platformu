import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ModerationService } from './moderation.service.js';
import { CreateModerationDto } from './dto/create-moderation.dto.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../common/types/jwt-payload.interface.js';

// No PATCH/DELETE: a moderation log entry is append-only, never edited or
// removed (that would let a MODERATOR tamper with the audit trail it
// exists to provide) — neither was used by the web app or any test, so
// they were removed rather than only locked down.
@ApiTags('moderation')
@Roles(Role.ADMIN, Role.MODERATOR)
@Controller('moderation')
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Post()
  create(@Body() createModerationDto: CreateModerationDto, @CurrentUser() currentUser: JwtPayload) {
    return this.moderationService.create(createModerationDto, currentUser.sub);
  }

  @Get()
  findAll(@Query('reportId') reportId?: string) {
    return this.moderationService.findAll(reportId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.moderationService.findOne(id);
  }
}
