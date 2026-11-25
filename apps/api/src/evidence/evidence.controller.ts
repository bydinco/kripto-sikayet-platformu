import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { EvidenceService } from './evidence.service.js';
import { EvidenceFileAccessService } from './files/evidence-file-access.service.js';
import { EXT_BY_MIME } from './files/evidence-storage-key.js';
import { CreateEvidenceDto } from './dto/create-evidence.dto.js';
import { UpdateEvidenceDto } from './dto/update-evidence.dto.js';
import { OptionalAuth } from '../common/decorators/optional-auth.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../common/types/jwt-payload.interface.js';

@ApiTags('evidence')
@Controller('evidence')
export class EvidenceController {
  constructor(
    private readonly evidenceService: EvidenceService,
    private readonly evidenceFileAccess: EvidenceFileAccessService,
  ) {}

  @Post()
  create(@Body() createEvidenceDto: CreateEvidenceDto, @CurrentUser() currentUser: JwtPayload) {
    return this.evidenceService.create(createEvidenceDto, currentUser);
  }

  @OptionalAuth()
  @Get()
  findAll(@CurrentUser() currentUser?: JwtPayload, @Query('reportId') reportId?: string) {
    return this.evidenceService.findAll(currentUser, reportId);
  }

  @OptionalAuth()
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() currentUser?: JwtPayload) {
    return this.evidenceService.findOne(id, currentUser);
  }

  // Unlike GET /evidence/:id (403 for the metadata), this returns 404 for
  // anyone not allowed to see the file — never reveals that a non-public
  // evidence row exists (see CLAUDE.md "Kanıt dosyası yükleme").
  @OptionalAuth()
  @Get(':id/file')
  async getFile(
    @Param('id') id: string,
    @CurrentUser() currentUser: JwtPayload | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { storageObject, mimeType, isPublic } = await this.evidenceFileAccess.getFile(id, currentUser);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Defense-in-depth alongside nosniff + the server-side mime allowlist:
    // explicit, server-chosen filename/extension, never the uploader's own
    // filename (which is never even stored — see CLAUDE.md).
    const ext = EXT_BY_MIME[mimeType as keyof typeof EXT_BY_MIME] ?? 'bin';
    res.setHeader('Content-Disposition', `inline; filename="evidence.${ext}"`);
    // Short on purpose: a report can go REMOVED (or evidence unapproved)
    // at any time, and this bounds how long a downstream cache/browser can
    // keep serving a 200 after that — matches the S3 driver's signed-URL
    // TTL (see STORAGE_PROVIDER), so both drivers share the same staleness
    // window regardless of which one is active.
    res.setHeader('Cache-Control', isPublic ? 'public, max-age=60' : 'no-store');

    if (storageObject.kind === 'redirect') {
      res.redirect(302, storageObject.url);
      return;
    }
    res.setHeader('Content-Type', mimeType);
    storageObject.stream.pipe(res);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateEvidenceDto: UpdateEvidenceDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.evidenceService.update(id, updateEvidenceDto, currentUser);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() currentUser: JwtPayload) {
    return this.evidenceService.remove(id, currentUser);
  }
}
