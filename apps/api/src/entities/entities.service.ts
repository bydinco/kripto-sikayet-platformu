import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateEntityDto } from './dto/create-entity.dto.js';
import { UpdateEntityDto } from './dto/update-entity.dto.js';
import { CreateEntityLinkDto } from './dto/create-entity-link.dto.js';
import type { JwtPayload } from '../common/types/jwt-payload.interface.js';

@Injectable()
export class EntitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createEntityDto: CreateEntityDto) {
    try {
      return await this.prisma.entity.create({ data: createEntityDto });
    } catch (error) {
      throw this.mapKnownError(error);
    }
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
      include: { stats: true, links: true },
    });
  }

  async update(id: string, updateEntityDto: UpdateEntityDto, currentUser: JwtPayload) {
    const { verified, ...rest } = updateEntityDto;
    if (verified !== undefined && currentUser.role !== Role.ADMIN) {
      throw new ForbiddenException('Doğrulanmış rozeti sadece ADMIN değiştirebilir.');
    }

    const data: Prisma.EntityUpdateInput = { ...rest };
    if (verified !== undefined) {
      data.verified = verified;
      data.verifiedAt = verified ? new Date() : null;
    }

    try {
      return await this.prisma.entity.update({ where: { id }, data });
    } catch (error) {
      throw this.mapKnownError(error);
    }
  }

  remove(id: string) {
    return this.prisma.entity.delete({ where: { id } });
  }

  async addLink(entityId: string, dto: CreateEntityLinkDto) {
    const entity = await this.prisma.entity.findUnique({ where: { id: entityId }, select: { id: true } });
    if (!entity) {
      throw new NotFoundException('Varlık bulunamadı.');
    }
    try {
      return await this.prisma.entityLink.create({ data: { ...dto, entityId } });
    } catch (error) {
      throw this.mapKnownError(error);
    }
  }

  async removeLink(entityId: string, linkId: string) {
    const link = await this.prisma.entityLink.findUnique({ where: { id: linkId } });
    if (!link || link.entityId !== entityId) {
      throw new NotFoundException('Link bulunamadı.');
    }
    return this.prisma.entityLink.delete({ where: { id: linkId } });
  }

  private mapKnownError(error: unknown): Error {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictException('Bu slug veya link zaten kullanılıyor.');
    }
    return error as Error;
  }
}
