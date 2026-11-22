import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { NoticesService } from './notices.service.js';
import { CreateNoticeDto } from './dto/create-notice.dto.js';
import { UpdateNoticeDto } from './dto/update-notice.dto.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../common/types/jwt-payload.interface.js';

const NOTICE_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@ApiTags('notices')
@Roles(Role.ADMIN, Role.MODERATOR)
@Controller('notices')
export class NoticesController {
  constructor(private readonly noticesService: NoticesService) {}

  // Public on purpose: legal/takedown notices come from third parties
  // (rights holders, courts), not necessarily registered users.
  @Public()
  @Roles()
  @Throttle(NOTICE_THROTTLE)
  @Post()
  async create(@Body() createNoticeDto: CreateNoticeDto) {
    const notice = await this.noticesService.create(createNoticeDto);
    return { id: notice.id, status: notice.status };
  }

  @Get()
  findAll() {
    return this.noticesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.noticesService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateNoticeDto: UpdateNoticeDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.noticesService.update(id, updateNoticeDto, currentUser);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.noticesService.remove(id);
  }
}
