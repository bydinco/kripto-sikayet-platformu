import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateScoringDto } from './dto/create-scoring.dto.js';
import { UpdateScoringDto } from './dto/update-scoring.dto.js';

@Injectable()
export class ScoringService {
  constructor(private readonly prisma: PrismaService) {}

  create(createScoringDto: CreateScoringDto) {
    return this.prisma.riskScore.create({ data: createScoringDto });
  }

  findAll() {
    return this.prisma.riskScore.findMany();
  }

  findOne(id: string) {
    return this.prisma.riskScore.findUnique({ where: { id } });
  }

  update(id: string, updateScoringDto: UpdateScoringDto) {
    return this.prisma.riskScore.update({ where: { id }, data: updateScoringDto });
  }

  remove(id: string) {
    return this.prisma.riskScore.delete({ where: { id } });
  }
}
