import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EvidenceType } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateEvidenceDto {
  @ApiProperty()
  @IsString()
  reportId!: string;

  @ApiProperty({ enum: EvidenceType })
  @IsEnum(EvidenceType)
  type!: EvidenceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
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
