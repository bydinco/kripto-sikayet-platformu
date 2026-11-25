import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, EntityStatus, EntityType, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ScoringService } from '../scoring/scoring.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CreateEntityDto } from './dto/create-entity.dto.js';
import { UpdateEntityDto } from './dto/update-entity.dto.js';
import { CreateEntityLinkDto } from './dto/create-entity-link.dto.js';
import { CreateContractAuditDto } from './dto/create-contract-audit.dto.js';
import type { JwtPayload } from '../common/types/jwt-payload.interface.js';

const EDITABLE_SCALAR_FIELDS = ['name', 'summary', 'country'] as const;

@Injectable()
export class EntitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringService,
    private readonly audit: AuditService,
  ) {}

  async create(createEntityDto: CreateEntityDto) {
    try {
      return await this.prisma.entity.create({ data: createEntityDto });
    } catch (error) {
      throw this.mapKnownError(error);
    }
  }

  // Pagination is mandatory, not optional: an unbounded public list
  // endpoint is an easy way to accidentally ship an unpaginated data dump.
  findAll(q?: string, type?: EntityType, take?: number) {
    const safeTake = Number.isFinite(take) && take! > 0 ? Math.min(take!, 50) : 20;
    return this.prisma.entity.findMany({
      where: {
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
        ...(type ? { type } : {}),
        // MERGED entities are superseded duplicates, not meant to surface
        // in browse/search results (direct navigation by slug/id in
        // findOne() below still resolves them, for old bookmarked links).
        status: { not: EntityStatus.MERGED },
      },
      orderBy: { name: 'asc' },
      take: safeTake,
    });
  }

  // Accepts either the cuid or the slug, so URLs can use the readable slug.
  findOne(idOrSlug: string) {
    return this.prisma.entity.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: {
        stats: true,
        links: true,
        coin: {
          include: {
            audits: {
              orderBy: { scannedAt: 'desc' },
              take: 1,
              // `raw` deliberately excluded: an arbitrary third-party scan
              // payload (GoPlus/DEXScreener/etc.), not shaped for public
              // display and not vetted for what it might contain.
              select: {
                id: true,
                ownerRenounced: true,
                isHoneypot: true,
                liquidityLocked: true,
                liquidityUsd: true,
                top10HolderPct: true,
                buyTaxPct: true,
                sellTaxPct: true,
                isProxy: true,
                scannedAt: true,
              },
            },
          },
        },
      },
    });
  }

  async update(id: string, updateEntityDto: UpdateEntityDto, currentUser: JwtPayload) {
    // Fetched up front (new — the old code relied on prisma.entity.update
    // itself to fail for a missing id, which it never handled and would
    // have 500'd): also doubles as the "before" snapshot for the audit
    // diff below.
    const existing = await this.prisma.entity.findUnique({
      where: { id },
      include: { coin: { select: { coingeckoId: true } } },
    });
    if (!existing) {
      throw new NotFoundException('Varlık bulunamadı.');
    }

    const { verified, coingeckoId, ...rest } = updateEntityDto;
    if (verified !== undefined && currentUser.role !== Role.ADMIN) {
      throw new ForbiddenException('Doğrulanmış rozeti sadece ADMIN değiştirebilir.');
    }

    const data: Prisma.EntityUpdateInput = { ...rest };
    if (verified !== undefined) {
      data.verified = verified;
      data.verifiedAt = verified ? new Date() : null;
    }

    try {
      await this.prisma.entity.update({ where: { id }, data });
    } catch (error) {
      throw this.mapKnownError(error);
    }

    if (coingeckoId !== undefined) {
      // updateMany (not update) on purpose: a non-COIN entity, or a COIN
      // entity whose Coin profile doesn't exist yet (there is still no API
      // to create one — see recordContractAudit above), simply has no row
      // to touch. Silently no-ops rather than erroring, since the admin
      // form may submit this field regardless of the entity's type.
      await this.prisma.coin.updateMany({ where: { entityId: id }, data: { coingeckoId: coingeckoId || null } });
    }

    // Non-critical (unlike role assignment/user deletion): fire-and-
    // forget. Only the fields actually present in the request, with
    // before/after values — all safe fields (name/summary/country/tags/
    // verified/coingeckoId), never a secret.
    const changedFields: Record<string, { from: unknown; to: unknown }> = {};
    for (const field of EDITABLE_SCALAR_FIELDS) {
      if (rest[field] !== undefined && rest[field] !== existing[field]) {
        changedFields[field] = { from: existing[field], to: rest[field] };
      }
    }
    if (rest.tags !== undefined && JSON.stringify(rest.tags) !== JSON.stringify(existing.tags)) {
      changedFields.tags = { from: existing.tags, to: rest.tags };
    }
    if (verified !== undefined && verified !== existing.verified) {
      changedFields.verified = { from: existing.verified, to: verified };
    }
    if (coingeckoId !== undefined) {
      const normalized = coingeckoId || null;
      const before = existing.coin?.coingeckoId ?? null;
      if (normalized !== before) {
        changedFields.coingeckoId = { from: before, to: normalized };
      }
    }
    if (Object.keys(changedFields).length > 0) {
      await this.audit.record({
        actorId: currentUser.sub,
        action: AuditAction.ENTITY_EDIT,
        targetType: 'Entity',
        targetId: id,
        metadata: { changedFields },
      });
    }

    return this.findOne(id);
  }

  remove(id: string) {
    return this.prisma.entity.delete({ where: { id } });
  }

  async addLink(entityId: string, dto: CreateEntityLinkDto, currentUser: JwtPayload) {
    const entity = await this.prisma.entity.findUnique({ where: { id: entityId }, select: { id: true } });
    if (!entity) {
      throw new NotFoundException('Varlık bulunamadı.');
    }
    let link;
    try {
      link = await this.prisma.entityLink.create({ data: { ...dto, entityId } });
    } catch (error) {
      throw this.mapKnownError(error);
    }
    await this.audit.record({
      actorId: currentUser.sub,
      action: AuditAction.ENTITY_EDIT,
      targetType: 'Entity',
      targetId: entityId,
      metadata: { linkAdded: { kind: link.kind, url: link.url } },
    });
    return link;
  }

  async removeLink(entityId: string, linkId: string, currentUser: JwtPayload) {
    const link = await this.prisma.entityLink.findUnique({ where: { id: linkId } });
    if (!link || link.entityId !== entityId) {
      throw new NotFoundException('Link bulunamadı.');
    }
    const removed = await this.prisma.entityLink.delete({ where: { id: linkId } });
    await this.audit.record({
      actorId: currentUser.sub,
      action: AuditAction.ENTITY_EDIT,
      targetType: 'Entity',
      targetId: entityId,
      metadata: { linkRemoved: { kind: removed.kind, url: removed.url } },
    });
    return removed;
  }

  // There is no API yet to create a Coin profile itself (seed/direct DB
  // only) — 400 if the entity doesn't have one.
  async recordContractAudit(entityId: string, dto: CreateContractAuditDto) {
    const coin = await this.prisma.coin.findUnique({ where: { entityId } });
    if (!coin) {
      throw new BadRequestException('Bu varlığın Coin profili yok.');
    }
    const audit = await this.prisma.contractAudit.create({ data: { coinId: coin.id, ...dto } });
    await this.scoring.safeRecomputeScore(entityId);
    return audit;
  }

  private mapKnownError(error: unknown): Error {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictException('Bu slug veya link zaten kullanılıyor.');
    }
    return error as Error;
  }
}
