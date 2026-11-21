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

  findAll(q?: string) {
    return this.prisma.entity.findMany({
      where: q ? { name: { contains: q, mode: 'insensitive' } } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  // Accepts either the cuid or the slug, so URLs can use the readable slug.
  findOne(idOrSlug: string) {
    return this.prisma.entity.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: { stats: true },
    });
  }

  update(id: string, updateEntityDto: UpdateEntityDto) {
    return this.prisma.entity.update({ where: { id }, data: updateEntityDto });
  }

  remove(id: string) {
    return this.prisma.entity.delete({ where: { id } });
  }
}
