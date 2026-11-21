import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ScoringService } from './scoring.service.js';
import { CreateScoringDto } from './dto/create-scoring.dto.js';
import { UpdateScoringDto } from './dto/update-scoring.dto.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';

@ApiTags('scoring')
@Controller('scoring')
export class ScoringController {
  constructor(private readonly scoringService: ScoringService) {}

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() createScoringDto: CreateScoringDto) {
    return this.scoringService.create(createScoringDto);
  }

  @Public()
  @Get()
  findAll() {
    return this.scoringService.findAll();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.scoringService.findOne(id);
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
