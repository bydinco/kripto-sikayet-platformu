import { randomBytes } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AuditAction, Role, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import type { JwtPayload } from '../common/types/jwt-payload.interface.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  create(createUserDto: CreateUserDto) {
    return this.prisma.user.create({ data: createUserDto });
  }

  // Soft-deleted accounts never appear in listing/search — see
  // CLAUDE.md "Kullanıcı silme".
  findAll() {
    return this.prisma.user.findMany({ where: { deletedAt: null } });
  }

  findOne(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  update(id: string, updateUserDto: UpdateUserDto) {
    return this.prisma.user.update({ where: { id }, data: updateUserDto });
  }

  // ADMIN only (enforced at the controller). Can't change your own role —
  // an ADMIN demoting themselves by accident is exactly the kind of
  // footgun this blocks — and the system's last ADMIN can never be
  // demoted away from ADMIN at all (409), or there would be no one left
  // who could promote anyone back. The role lives inside the JWT
  // (JwtPayload.role, never re-checked against the DB — see
  // JwtAuthGuard), so a role change here only takes effect once the
  // target's current access token expires (JWT_ACCESS_TTL, 15 min
  // default) or they're forced to refresh — which this also forces
  // immediately by revoking every refresh token they currently hold.
  async setRole(targetId: string, newRole: Role, currentUser: JwtPayload): Promise<User> {
    if (targetId === currentUser.sub) {
      throw new ForbiddenException('Kendi rolünüzü değiştiremezsiniz.');
    }

    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) {
      throw new NotFoundException('Kullanıcı bulunamadı.');
    }

    if (target.role === Role.ADMIN && newRole !== Role.ADMIN) {
      const adminCount = await this.prisma.user.count({ where: { role: Role.ADMIN, deletedAt: null } });
      if (adminCount <= 1) {
        throw new ConflictException('Sistemdeki son ADMIN rolden düşürülemez.');
      }
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: targetId }, data: { role: newRole } }),
      this.prisma.refreshToken.updateMany({
        where: { userId: targetId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.audit.write({
        actorId: currentUser.sub,
        action: AuditAction.USER_ROLE_SET,
        targetType: 'User',
        targetId,
        metadata: { fromRole: target.role, toRole: newRole },
      }),
    ]);

    return updated;
  }

  // Self-service deletion (DELETE /users/me) — requires the caller's own
  // current password as confirmation.
  async deleteSelf(currentUser: JwtPayload, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUser.sub },
      omit: { passwordHash: false },
    });
    if (!user || !user.passwordHash || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Parola doğrulanamadı.');
    }
    await this.anonymizeAndSoftDelete(user, AuditAction.USER_SELF_DELETE, currentUser.sub);
  }

  // ADMIN-initiated deletion (DELETE /users/:id) — no password check, the
  // caller's own ADMIN role is the authorization.
  async deleteByAdmin(targetId: string, currentUser: JwtPayload): Promise<void> {
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) {
      throw new NotFoundException('Kullanıcı bulunamadı.');
    }
    await this.anonymizeAndSoftDelete(target, AuditAction.USER_DELETE, currentUser.sub);
  }

  // Soft delete + anonymization, one transaction: deletedAt set, email/
  // handle overwritten (so both become reusable by a new registration),
  // passwordHash scrambled to a fresh random argon2 hash (login
  // impossible even if somehow re-checked against a cached value), every
  // refresh token revoked. Reports/comments/votes/responses the user
  // wrote are NOT touched — they stay, now showing under the
  // anonymized handle (see CLAUDE.md "Kullanıcı silme": this is a
  // product/legal decision, KVKK/GDPR avukat incelemesi gerekir, not a
  // purely technical one).
  private async anonymizeAndSoftDelete(user: User, action: AuditAction, actorId: string): Promise<void> {
    if (user.deletedAt) {
      throw new NotFoundException('Kullanıcı bulunamadı.');
    }

    if (user.role === Role.ADMIN) {
      const adminCount = await this.prisma.user.count({ where: { role: Role.ADMIN, deletedAt: null } });
      if (adminCount <= 1) {
        throw new ConflictException('Sistemdeki son ADMIN silinemez.');
      }
    }

    const scrambledPasswordHash = await argon2.hash(randomBytes(32).toString('hex'), { type: argon2.argon2id });
    const anonymizedHandle = `deleted-${randomBytes(6).toString('hex')}`;

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          deletedAt: new Date(),
          email: `deleted-${user.id}@deleted.invalid`,
          handle: anonymizedHandle,
          passwordHash: scrambledPasswordHash,
          emailVerified: false,
        },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      // Previous email/handle deliberately NOT recorded — see
      // AuditService's redaction note and CLAUDE.md.
      this.audit.write({ actorId, action, targetType: 'User', targetId: user.id }),
    ]);
  }
}
