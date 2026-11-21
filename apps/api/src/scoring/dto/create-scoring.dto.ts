import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RiskLevel } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

// Maps to RiskScore: a stored score snapshot for an entity under a given
// RiskModel version. The scoring algorithm itself is out of scope here.
export class CreateScoringDto {
  @ApiProperty()
  @IsString()
  entityId!: string;

  @ApiProperty()
  @IsString()
  modelId!: string;

  @ApiProperty()
  @IsInt()
  score!: number;

  @ApiProperty({ enum: RiskLevel })
  @IsEnum(RiskLevel)
  level!: RiskLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  confidence?: number;
}
