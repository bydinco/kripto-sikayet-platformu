import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { EntitiesService } from './entities.service.js';
import { CreateEntityDto } from './dto/create-entity.dto.js';
import { UpdateEntityDto } from './dto/update-entity.dto.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';

@ApiTags('entities')
@Controller('entities')
export class EntitiesController {
  constructor(private readonly entitiesService: EntitiesService) {}

  @Roles(Role.ADMIN, Role.EDITOR)
  @Post()
  create(@Body() createEntityDto: CreateEntityDto) {
    return this.entitiesService.create(createEntityDto);
  }

  @Public()
  @Get()
  findAll() {
    return this.entitiesService.findAll();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.entitiesService.findOne(id);
  }

  @Roles(Role.ADMIN, Role.EDITOR)
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateEntityDto: UpdateEntityDto) {
    return this.entitiesService.update(id, updateEntityDto);
  }

  @Roles(Role.ADMIN, Role.EDITOR)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.entitiesService.remove(id);
  }
}
