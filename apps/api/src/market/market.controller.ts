import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator.js';
import { MarketService } from './market.service.js';

@ApiTags('market')
@Controller('market')
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  @Public()
  @Get('prices')
  listPrices(@Query('take') take?: string) {
    return this.marketService.listPrices(take ? Number(take) : undefined);
  }

  @Public()
  @Get('prices/:entitySlug')
  getPrice(@Param('entitySlug') entitySlug: string) {
    return this.marketService.getPrice(entitySlug);
  }
}
