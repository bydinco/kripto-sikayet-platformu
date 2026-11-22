import { Module } from '@nestjs/common';
import { RevalidateService } from './revalidate.service.js';

@Module({
  providers: [RevalidateService],
  exports: [RevalidateService],
})
export class RevalidateModule {}
