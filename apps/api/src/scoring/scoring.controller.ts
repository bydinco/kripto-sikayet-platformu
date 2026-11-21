import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ScoringService } from './scoring.service.js';
import { CreateScoringDto } from './dto/create-scoring.dto.js';
import { UpdateScoringDto } from './dto/update-scoring.dto.js';

@ApiTags('scoring')
@Controller('scoring')
export class ScoringController {
  constructor(private readonly scoringService: ScoringService) {}

  @Post()
  create(@Body() createScoringDto: CreateScoringDto) {
    return this.scoringService.create(createScoringDto);
  }

  @Get()
  findAll() {
    return this.scoringService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.scoringService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateScoringDto: UpdateScoringDto) {
    return this.scoringService.update(id, updateScoringDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.scoringService.remove(id);
  }
}
