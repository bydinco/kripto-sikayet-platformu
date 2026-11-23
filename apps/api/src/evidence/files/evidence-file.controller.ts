import { Controller, Param, Post, UploadedFile, UseFilters, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { EvidenceFileService } from './evidence-file.service.js';
import { MAX_FILE_SIZE_BYTES } from './evidence-file.constants.js';
import { MulterExceptionFilter } from './multer-exception.filter.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../common/types/jwt-payload.interface.js';

// Burst control only — EvidenceFileService.upload separately enforces the
// per-user daily quota and the per-report file cap.
const UPLOAD_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('evidence')
@Controller('reports/:reportId/evidence/files')
@UseFilters(MulterExceptionFilter)
export class EvidenceFileController {
  constructor(private readonly evidenceFileService: EvidenceFileService) {}

  @Throttle(UPLOAD_THROTTLE)
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE_BYTES } }))
  upload(
    @Param('reportId') reportId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.evidenceFileService.upload(reportId, file, currentUser);
  }
}
