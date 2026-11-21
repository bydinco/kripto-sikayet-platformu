import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateEntityDto } from './dto/create-entity.dto.js';
import { UpdateEntityDto } from './dto/update-entity.dto.js';

@Injectable()
export class EntitiesService {
  constructor(private readonly prisma: PrismaService) {}

  create(createEntityDto: CreateEntityDto) {
    return this.prisma.entity.create({ data: createEntityDto });
  }

  findAll() {
    return this.prisma.entity.findMany();
  }

  findOne(id: string) {
    return this.prisma.entity.findUnique({ where: { id } });
  }

  update(id: string, updateEntityDto: UpdateEntityDto) {
    return this.prisma.entity.update({ where: { id }, data: updateEntityDto });
  }

  remove(id: string) {
    return this.prisma.entity.delete({ where: { id } });
  }
}
