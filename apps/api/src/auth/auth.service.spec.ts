import { ConflictException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { Prisma, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

function buildPrismaMock() {
  return {
    user: { create: vi.fn(), findUnique: vi.fn() },
    refreshToken: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  };
}

describe('AuthService', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let jwtService: { signAsync: ReturnType<typeof vi.fn> };
  let configService: { get: ReturnType<typeof vi.fn> };
  let service: AuthService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    jwtService = { signAsync: vi.fn().mockResolvedValue('signed.jwt.token') };
    configService = { get: vi.fn().mockReturnValue(30) };
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
    );
  });

  it('hashes the password and always registers with role USER', async () => {
    prisma.user.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'u1', ...data }),
    );

    const user = await service.register({ email: 'a@b.com', password: 'supersecret1', handle: 'a' });

    expect(prisma.user.create).toHaveBeenCalledOnce();
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.role).toBe(Role.USER);
    expect(data.passwordHash).not.toBe('supersecret1');
    expect(await argon2.verify(data.passwordHash, 'supersecret1')).toBe(true);
    expect(user.email).toBe('a@b.com');
  });

  it('turns a unique-constraint violation into a ConflictException', async () => {
    prisma.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '7.10.1' }),
    );

    await expect(
      service.register({ email: 'a@b.com', password: 'supersecret1', handle: 'a' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('validates correct credentials', async () => {
    const passwordHash = await argon2.hash('supersecret1', { type: argon2.argon2id });
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', passwordHash });

    const user = await service.validateCredentials('a@b.com', 'supersecret1');
    expect(user.id).toBe('u1');
  });

  it('rejects a wrong password and a non-existent e-mail with the same error', async () => {
    const passwordHash = await argon2.hash('supersecret1', { type: argon2.argon2id });
    prisma.user.findUnique.mockResolvedValueOnce({ id: 'u1', email: 'a@b.com', passwordHash });
    const wrongPassword = service.validateCredentials('a@b.com', 'nope').catch((e) => e);

    prisma.user.findUnique.mockResolvedValueOnce(null);
    const unknownEmail = service.validateCredentials('nobody@b.com', 'nope').catch((e) => e);

    const [errA, errB] = await Promise.all([wrongPassword, unknownEmail]);
    expect(errA).toBeInstanceOf(UnauthorizedException);
    expect(errB).toBeInstanceOf(UnauthorizedException);
    expect(errA.message).toBe(errB.message);
  });

  it('rotates the refresh token on refresh()', async () => {
    const existing = {
      id: 'rt1',
      userId: 'u1',
      tokenHash: 'hash',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    };
    prisma.refreshToken.findUnique.mockResolvedValue(existing);
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: Role.USER });
    prisma.refreshToken.update.mockResolvedValue({ ...existing, revokedAt: new Date() });
    prisma.refreshToken.create.mockResolvedValue({});

    const { user } = await service.refresh('raw-token', {});

    expect(user.id).toBe('u1');
    expect(prisma.refreshToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'rt1' } }),
    );
    expect(prisma.refreshToken.create).toHaveBeenCalledOnce();
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('revokes every session for the user when a revoked refresh token is reused', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt1',
      userId: 'u1',
      tokenHash: 'hash',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });

    await expect(service.refresh('stolen-token', {})).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', revokedAt: null } }),
    );
  });
});
