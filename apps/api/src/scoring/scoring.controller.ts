import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ScoringService } from './scoring.service.js';
import { CreateScoringDto } from './dto/create-scoring.dto.js';
import { UpdateScoringDto } from './dto/update-scoring.dto.js';
import { UpdateRiskModelDto } from './dto/update-risk-model.dto.js';
import { OptionalAuth } from '../common/decorators/optional-auth.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../common/types/jwt-payload.interface.js';

@ApiTags('scoring')
@Controller('scoring')
export class ScoringController {
  constructor(private readonly scoringService: ScoringService) {}

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() createScoringDto: CreateScoringDto) {
    return this.scoringService.create(createScoringDto);
  }

  // ADMIN only — re-runs the engine using the latest model for the
  // entity's type (active or not). Lets ADMIN preview a draft model's
  // output before ever activating it.
  @Roles(Role.ADMIN)
  @Post('recompute/:entityId')
  recompute(@Param('entityId') entityId: string) {
    return this.scoringService.recomputeScore(entityId);
  }

  // Public — the methodology page's data source.
  @Public()
  @Get('models/active')
  listActiveModels() {
    return this.scoringService.listActiveModels();
  }

  // ADMIN only — activating a model deactivates every other version of
  // the same entityType.
  @Roles(Role.ADMIN)
  @Patch('models/:id')
  setModelActive(@Param('id') id: string, @Body() dto: UpdateRiskModelDto) {
    return this.scoringService.setModelActive(id, dto.active);
  }

  // Visible to everyone, but non-ADMIN only ever sees scores computed
  // under a currently-active model.
  @OptionalAuth()
  @Get()
  findAll(@CurrentUser() currentUser?: JwtPayload, @Query('entityId') entityId?: string) {
    return this.scoringService.findAll(currentUser, entityId);
  }

  @OptionalAuth()
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() currentUser?: JwtPayload) {
    return this.scoringService.findOne(id, currentUser);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateScoringDto: UpdateScoringDto) {
    return this.scoringService.update(id, updateScoringDto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.scoringService.remove(id);
  }
}
