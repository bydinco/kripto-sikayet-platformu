import { ApiPropertyOptional } from '@nestjs/swagger';
import { ReportCategory, ReportStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

// Three groups of fields, in one DTO because they share a single PATCH
// endpoint; ReportsService enforces who may use which group and when:
//  - content: author only, while PENDING/NEEDS_EVIDENCE.
//  - status/reason: moderator/admin transition (reason mandatory when
//    status is present; publishedAt/resolvedAt are server-computed, not
//    here).
//  - satisfaction*: author only, only once, only after RESOLVED.
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

  @ApiPropertyOptional({ enum: ReportStatus })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @ApiPropertyOptional({ description: 'Mandatory whenever status is set.' })
  @IsOptional()
  @IsString()
  reason?: string;

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

export const CONTENT_FIELDS = ['category', 'title', 'body', 'lossUsd', 'incidentAt'] as const satisfies readonly (keyof UpdateReportDto)[];
export const SATISFACTION_FIELDS = ['satisfactionRating', 'satisfactionNote'] as const satisfies readonly (keyof UpdateReportDto)[];
