import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateReportDto } from './dto/create-report.dto.js';
import { UpdateReportDto } from './dto/update-report.dto.js';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  create(createReportDto: CreateReportDto) {
    return this.prisma.report.create({ data: createReportDto });
  }

  findAll() {
    return this.prisma.report.findMany();
  }

  findOne(id: string) {
    return this.prisma.report.findUnique({ where: { id } });
  }

  update(id: string, updateReportDto: UpdateReportDto) {
    return this.prisma.report.update({ where: { id }, data: updateReportDto });
  }

  remove(id: string) {
    return this.prisma.report.delete({ where: { id } });
  }
}
