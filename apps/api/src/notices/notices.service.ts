import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateNoticeDto } from './dto/create-notice.dto.js';
import { UpdateNoticeDto } from './dto/update-notice.dto.js';

@Injectable()
export class NoticesService {
  constructor(private readonly prisma: PrismaService) {}

  create(createNoticeDto: CreateNoticeDto) {
    return this.prisma.notice.create({ data: createNoticeDto });
  }

  findAll() {
    return this.prisma.notice.findMany();
  }

  findOne(id: string) {
    return this.prisma.notice.findUnique({ where: { id } });
  }

  update(id: string, updateNoticeDto: UpdateNoticeDto) {
    return this.prisma.notice.update({ where: { id }, data: updateNoticeDto });
  }

  remove(id: string) {
    return this.prisma.notice.delete({ where: { id } });
  }
}
