import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateEvidenceDto } from './create-evidence.dto.js';

export class UpdateEvidenceDto extends PartialType(CreateEvidenceDto) {
  // Moderator/admin only (see EvidenceService.update).
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  approved?: boolean;
}
