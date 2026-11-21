import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EvidenceService } from './evidence.service.js';
import { CreateEvidenceDto } from './dto/create-evidence.dto.js';
import { UpdateEvidenceDto } from './dto/update-evidence.dto.js';
import { OptionalAuth } from '../common/decorators/optional-auth.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../common/types/jwt-payload.interface.js';

@ApiTags('evidence')
@Controller('evidence')
export class EvidenceController {
  constructor(private readonly evidenceService: EvidenceService) {}

  @Post()
  create(@Body() createEvidenceDto: CreateEvidenceDto, @CurrentUser() currentUser: JwtPayload) {
    return this.evidenceService.create(createEvidenceDto, currentUser);
  }

  @OptionalAuth()
  @Get()
  findAll(@CurrentUser() currentUser?: JwtPayload, @Query('reportId') reportId?: string) {
    return this.evidenceService.findAll(currentUser, reportId);
  }

  @OptionalAuth()
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() currentUser?: JwtPayload) {
    return this.evidenceService.findOne(id, currentUser);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateEvidenceDto: UpdateEvidenceDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.evidenceService.update(id, updateEvidenceDto, currentUser);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() currentUser: JwtPayload) {
    return this.evidenceService.remove(id, currentUser);
  }
}
