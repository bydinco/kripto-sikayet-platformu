import { Body, Controller, Delete, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { MeTooService } from './me-too.service.js';
import { CreateMeTooDto } from './dto/create-me-too.dto.js';
import { ME_TOO_THROTTLE } from './engagement.constants.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../common/types/jwt-payload.interface.js';

@ApiTags('engagement')
@Controller('reports/:reportId/me-too')
export class MeTooController {
  constructor(private readonly meTooService: MeTooService) {}

  @Throttle(ME_TOO_THROTTLE)
  @Post()
  create(
    @Param('reportId') reportId: string,
    @Body() dto: CreateMeTooDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.meTooService.create(reportId, dto, currentUser);
  }

  @Throttle(ME_TOO_THROTTLE)
  @Delete()
  remove(@Param('reportId') reportId: string, @CurrentUser() currentUser: JwtPayload) {
    return this.meTooService.remove(reportId, currentUser);
  }
}
