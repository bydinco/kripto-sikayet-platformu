import { Module } from '@nestjs/common';
import { ResponsesService } from './responses.service.js';
import { ResponsesController } from './responses.controller.js';
import { EntitiesModule } from '../entities/entities.module.js';

@Module({
  imports: [EntitiesModule],
  controllers: [ResponsesController],
  providers: [ResponsesService],
})
export class ResponsesModule {}
