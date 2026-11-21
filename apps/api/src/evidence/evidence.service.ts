import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateEvidenceDto } from './dto/create-evidence.dto.js';
import { UpdateEvidenceDto } from './dto/update-evidence.dto.js';

@Injectable()
export class EvidenceService {
  constructor(private readonly prisma: PrismaService) {}

  create(createEvidenceDto: CreateEvidenceDto) {
    return this.prisma.evidence.create({ data: createEvidenceDto });
  }

  findAll() {
    return this.prisma.evidence.findMany();
  }

  findOne(id: string) {
    return this.prisma.evidence.findUnique({ where: { id } });
  }

  update(id: string, updateEvidenceDto: UpdateEvidenceDto) {
    return this.prisma.evidence.update({ where: { id }, data: updateEvidenceDto });
  }

  remove(id: string) {
    return this.prisma.evidence.delete({ where: { id } });
  }
}
