import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

// Activating a model deactivates every other version of the same
// entityType (ScoringService.setModelActive) — only one active version per
// type at a time.
export class UpdateRiskModelDto {
  @ApiProperty()
  @IsBoolean()
  active!: boolean;
}
