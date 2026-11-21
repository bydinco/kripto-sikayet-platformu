import { randomBytes, createHash } from 'node:crypto';
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Prisma, Role, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { RegisterDto } from './dto/register.dto.js';
import type { JwtPayload } from '../common/types/jwt-payload.interface.js';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface RequestMeta {
  userAgent?: string;
  ip?: string;
}

// Used to run argon2.verify against *something* when the e-mail doesn't
// exist, so a login attempt takes roughly the same time either way and
// can't be used to enumerate registered e-mails.
const DUMMY_HASH = await argon2.hash(randomBytes(32).toString('hex'), { type: argon2.argon2id });

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<User> {
    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    try {
      return await this.prisma.user.create({
        data: {
          email: dto.email,
          handle: dto.handle,
          passwordHash,
          role: Role.USER,
          emailVerified: false,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Bu e-posta veya kullanıcı adı zaten kayıtlı.');
      }
      throw error;
    }
  }

  async validateCredentials(email: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      omit: { passwordHash: false },
    });

    const hashToCheck = user?.passwordHash ?? DUMMY_HASH;
    const passwordOk = await argon2.verify(hashToCheck, password);

    if (!user || !user.passwordHash || !passwordOk) {
      throw new UnauthorizedException('E-posta veya parola hatalı.');
    }
    return user;
  }

  async issueTokens(user: User, meta: RequestMeta): Promise<IssuedTokens> {
    const payload: JwtPayload = { sub: user.id, role: user.role };
    const accessToken = await this.jwtService.signAsync(payload);

    const refreshToken = randomBytes(64).toString('hex');
    const ttlDays = this.configService.get<number>('REFRESH_TOKEN_TTL_DAYS', 30);
    const refreshExpiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: refreshExpiresAt,
        userAgent: meta.userAgent,
        ip: meta.ip,
      },
    });

    return { accessToken, refreshToken, refreshExpiresAt };
  }

  async refresh(rawToken: string, meta: RequestMeta): Promise<{ user: User; tokens: IssuedTokens }> {
    const tokenHash = this.hashToken(rawToken);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!existing) {
      throw new UnauthorizedException('Oturum geçersiz, tekrar giriş yapın.');
    }

    if (existing.revokedAt) {
      // Reuse of a revoked token: treat as stolen, kill every session.
      await this.revokeAllForUser(existing.userId);
      throw new UnauthorizedException('Oturum geçersiz, tekrar giriş yapın.');
    }

    if (existing.expiresAt < new Date()) {
      throw new UnauthorizedException('Oturum süresi doldu, tekrar giriş yapın.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: existing.userId } });
    if (!user) {
      throw new UnauthorizedException('Oturum geçersiz, tekrar giriş yapın.');
    }

    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.issueTokens(user, meta);
    return { user, tokens };
  }

  async logout(rawToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }
}
