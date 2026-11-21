import { Module } from '@nestjs/common';
import { EntitiesService } from './entities.service.js';
import { EntitiesController } from './entities.controller.js';

@Module({
  controllers: [EntitiesController],
  providers: [EntitiesService],
})
export class EntitiesModule {}
