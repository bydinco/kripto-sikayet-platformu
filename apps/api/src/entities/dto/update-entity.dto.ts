import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateEntityDto } from './create-entity.dto.js';

export class UpdateEntityDto extends PartialType(CreateEntityDto) {
  // Not on CreateEntityDto on purpose: a brand is never "pre-verified" at
  // creation. Only ADMIN may set this (enforced in EntitiesService), and it
  // never affects the risk score.
  @ApiPropertyOptional({ description: 'ADMIN only. Never affects the risk score.' })
  @IsOptional()
  @IsBoolean()
  verified?: boolean;
}
