import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ModerationService } from './moderation.service.js';
import { CreateModerationDto } from './dto/create-moderation.dto.js';
import { UpdateModerationDto } from './dto/update-moderation.dto.js';
import { Roles } from '../common/decorators/roles.decorator.js';

@ApiTags('moderation')
@Roles(Role.ADMIN, Role.MODERATOR)
@Controller('moderation')
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Post()
  create(@Body() createModerationDto: CreateModerationDto) {
    return this.moderationService.create(createModerationDto);
  }

  @Get()
  findAll(@Query('reportId') reportId?: string) {
    return this.moderationService.findAll(reportId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.moderationService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateModerationDto: UpdateModerationDto) {
    return this.moderationService.update(id, updateModerationDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.moderationService.remove(id);
  }
}
