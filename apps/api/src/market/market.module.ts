import { Module } from '@nestjs/common';
import { MarketCache } from './market-cache.js';
import { MarketService } from './market.service.js';
import { MarketPriceRefreshService } from './market-price-refresh.service.js';
import { MarketController } from './market.controller.js';

@Module({
  controllers: [MarketController],
  providers: [MarketCache, MarketService, MarketPriceRefreshService],
  exports: [MarketService],
})
export class MarketModule {}
