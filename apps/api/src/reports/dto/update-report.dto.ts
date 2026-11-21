import { ApiPropertyOptional } from '@nestjs/swagger';
import { ReportCategory, ReportStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

// Author-editable fields (allowed only while the report is still
// PENDING/NEEDS_EVIDENCE) plus moderator-only fields in the same DTO;
// ReportsService enforces who may set which ones.
export class UpdateReportDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(ReportCategory)
  category?: ReportCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  lossUsd?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  incidentAt?: string;

  // ─── Moderator/Admin only (see MODERATOR_ONLY_REPORT_FIELDS) ───

  @ApiPropertyOptional({ enum: ReportStatus })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  publishedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  resolvedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  satisfactionRating?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  satisfactionNote?: string;
}

export const MODERATOR_ONLY_REPORT_FIELDS = [
  'status',
  'publishedAt',
  'resolvedAt',
  'satisfactionRating',
  'satisfactionNote',
] as const satisfies readonly (keyof UpdateReportDto)[];
