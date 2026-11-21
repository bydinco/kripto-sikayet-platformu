import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { envValidationSchema } from './config/env.validation.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { EntitiesModule } from './entities/entities.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { EvidenceModule } from './evidence/evidence.module.js';
import { ScoringModule } from './scoring/scoring.module.js';
import { ModerationModule } from './moderation/moderation.module.js';
import { NoticesModule } from './notices/notices.module.js';
import { ResponsesModule } from './responses/responses.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 60 }],
      // e2e tests legitimately call login/register far more than 60 times
      // a minute; NestJS's testing container can't cleanly override a guard
      // that's bound only via APP_GUARD, so this is disabled by env instead.
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    EntitiesModule,
    ReportsModule,
    EvidenceModule,
    ScoringModule,
    ModerationModule,
    NoticesModule,
    ResponsesModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
