import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, Max, Min } from 'class-validator';

// Records one scan snapshot against the entity's Coin profile
// (ContractAudit.coinId) — see EntitiesService.recordContractAudit. There
// is no API yet to create the Coin profile itself; for now that only
// happens via seed data or direct DB access.
export class CreateContractAuditDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  ownerRenounced?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isHoneypot?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  liquidityLocked?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  liquidityUsd?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  top10HolderPct?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  buyTaxPct?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  sellTaxPct?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isProxy?: boolean;
}
