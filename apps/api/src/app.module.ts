import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { EntitiesModule } from './entities/entities.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { EvidenceModule } from './evidence/evidence.module.js';
import { ScoringModule } from './scoring/scoring.module.js';
import { ModerationModule } from './moderation/moderation.module.js';
import { NoticesModule } from './notices/notices.module.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    EntitiesModule,
    ReportsModule,
    EvidenceModule,
    ScoringModule,
    ModerationModule,
    NoticesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
