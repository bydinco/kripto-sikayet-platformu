import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReportCategory } from '@prisma/client';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

// authorId comes from the JWT (@CurrentUser()), never from the client.
// status/publishedAt/resolvedAt/satisfaction* are moderator-only and are
// never settable at creation time.
export class CreateReportDto {
  @ApiProperty()
  @IsString()
  entityId!: string;

  @ApiProperty({ enum: ReportCategory })
  @IsEnum(ReportCategory)
  category!: ReportCategory;

  @ApiProperty()
  @IsString()
  title!: string;

  @ApiProperty()
  @IsString()
  body!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  lossUsd?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  incidentAt?: string;
}
