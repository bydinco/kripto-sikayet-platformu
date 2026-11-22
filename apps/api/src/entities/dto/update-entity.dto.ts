import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { CreateEntityDto } from './create-entity.dto.js';

export class UpdateEntityDto extends PartialType(CreateEntityDto) {
  // Not on CreateEntityDto on purpose: a brand is never "pre-verified" at
  // creation. Only ADMIN may set this (enforced in EntitiesService), and it
  // never affects the risk score.
  @ApiPropertyOptional({ description: 'ADMIN only. Never affects the risk score.' })
  @IsOptional()
  @IsBoolean()
  verified?: boolean;

  // COIN entities only; silently ignored for other types or when the
  // entity has no Coin profile yet (see EntitiesService.update — there is
  // still no API to create a Coin profile itself). Used only to look up
  // live price data, never fed into the risk score engine. Empty string
  // clears it.
  @ApiPropertyOptional({ description: 'CoinGecko id for this coin (e.g. "bitcoin"). COIN entities only. Never affects the risk score.' })
  @IsOptional()
  @IsString()
  coingeckoId?: string;
}
