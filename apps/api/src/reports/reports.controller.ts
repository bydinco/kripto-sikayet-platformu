import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ReportStatus, Role } from '@prisma/client';
import { ReportsService } from './reports.service.js';
import { CreateReportDto } from './dto/create-report.dto.js';
import { UpdateReportDto } from './dto/update-report.dto.js';
import { OptionalAuth } from '../common/decorators/optional-auth.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../common/types/jwt-payload.interface.js';

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  create(@Body() createReportDto: CreateReportDto, @CurrentUser() currentUser: JwtPayload) {
    return this.reportsService.create(createReportDto, currentUser);
  }

  @OptionalAuth()
  @Get()
  findAll(
    @CurrentUser() currentUser?: JwtPayload,
    @Query('entityId') entityId?: string,
    @Query('take') take?: string,
    @Query('status') status?: string,
  ) {
    return this.reportsService.findAll(currentUser, {
      entityId,
      take: take ? Number(take) : undefined,
      status: status ? this.parseStatusList(status) : undefined,
    });
  }

  @Get('mine')
  findMine(@CurrentUser() currentUser: JwtPayload) {
    return this.reportsService.findMine(currentUser);
  }

  // Moderation queue counts, e.g. { PENDING: 3, NEEDS_EVIDENCE: 1, ... }.
  @Roles(Role.ADMIN, Role.MODERATOR)
  @Get('status-counts')
  statusCounts() {
    return this.reportsService.statusCounts();
  }

  @OptionalAuth()
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() currentUser?: JwtPayload) {
    return this.reportsService.findOne(id, currentUser);
  }

  @Roles(Role.ADMIN, Role.MODERATOR)
  @Get(':id/status-history')
  statusHistory(@Param('id') id: string) {
    return this.reportsService.statusHistory(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateReportDto: UpdateReportDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.reportsService.update(id, updateReportDto, currentUser);
  }

  @Roles(Role.ADMIN, Role.MODERATOR)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.reportsService.remove(id);
  }

  // Brand-initiated "mark as resolved" flow, separate from the moderator
  // transition mechanism above: the brand requests, the complainant approves.
  @HttpCode(200)
  @Post(':id/resolution-request')
  requestResolution(@Param('id') id: string, @CurrentUser() currentUser: JwtPayload) {
    return this.reportsService.requestResolution(id, currentUser);
  }

  @HttpCode(200)
  @Post(':id/resolution-approve')
  approveResolution(@Param('id') id: string, @CurrentUser() currentUser: JwtPayload) {
    return this.reportsService.approveResolution(id, currentUser);
  }

  private parseStatusList(raw: string): ReportStatus[] {
    const values = raw.split(',').map((v) => v.trim());
    const validValues = new Set<string>(Object.values(ReportStatus));
    for (const value of values) {
      if (!validValues.has(value)) {
        throw new BadRequestException(`Geçersiz durum: ${value}`);
      }
    }
    return values as ReportStatus[];
  }
}
