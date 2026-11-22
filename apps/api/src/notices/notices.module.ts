import { Module } from '@nestjs/common';
import { NoticesService } from './notices.service.js';
import { NoticesController } from './notices.controller.js';
import { RevalidateModule } from '../revalidate/revalidate.module.js';

@Module({
  imports: [RevalidateModule],
  controllers: [NoticesController],
  providers: [NoticesService],
})
export class NoticesModule {}
