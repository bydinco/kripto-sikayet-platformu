import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EvidenceType } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { IsValidEvidenceValue } from '../validators/is-valid-evidence-value.validator.js';

export class CreateEvidenceDto {
  @ApiProperty()
  @IsString()
  reportId!: string;

  @ApiProperty({ enum: EvidenceType })
  @IsEnum(EvidenceType)
  type!: EvidenceType;

  @ApiPropertyOptional({ description: 'Must be an http(s) URL when type is LINK.' })
  @IsOptional()
  @IsValidEvidenceValue()
  value?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fileUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  chainId?: string;
}
