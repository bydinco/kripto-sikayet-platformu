import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EntityType, Role } from '@prisma/client';
import { EntitiesService } from './entities.service.js';
import { CreateEntityDto } from './dto/create-entity.dto.js';
import { UpdateEntityDto } from './dto/update-entity.dto.js';
import { CreateEntityLinkDto } from './dto/create-entity-link.dto.js';
import { CreateContractAuditDto } from './dto/create-contract-audit.dto.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../common/types/jwt-payload.interface.js';

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
  findAll(@Query('q') q?: string, @Query('type') type?: string, @Query('take') take?: string) {
    if (type && !Object.values(EntityType).includes(type as EntityType)) {
      throw new BadRequestException(`Geçersiz tür: ${type}`);
    }
    return this.entitiesService.findAll(q, type as EntityType | undefined, take ? Number(take) : undefined);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.entitiesService.findOne(id);
  }

  // Note: ':id' above also matches a slug, since findOne() checks both.

  @Roles(Role.ADMIN, Role.EDITOR)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateEntityDto: UpdateEntityDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.entitiesService.update(id, updateEntityDto, currentUser);
  }

  @Roles(Role.ADMIN, Role.EDITOR)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.entitiesService.remove(id);
  }

  @Roles(Role.ADMIN, Role.EDITOR)
  @Post(':id/links')
  addLink(@Param('id') id: string, @Body() dto: CreateEntityLinkDto) {
    return this.entitiesService.addLink(id, dto);
  }

  @Roles(Role.ADMIN, Role.EDITOR)
  @Delete(':id/links/:linkId')
  removeLink(@Param('id') id: string, @Param('linkId') linkId: string) {
    return this.entitiesService.removeLink(id, linkId);
  }

  @Roles(Role.ADMIN, Role.EDITOR)
  @Post(':id/contract-audits')
  addContractAudit(@Param('id') id: string, @Body() dto: CreateContractAuditDto) {
    return this.entitiesService.recordContractAudit(id, dto);
  }
}
