import { AuditAction } from '@prisma/client';
import { AuditService } from './audit.service.js';

function makePrisma() {
  return {
    auditLog: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'audit-1', ...data }),
      ),
    },
  };
}

describe('AuditService', () => {
  it('record() writes action/targetType/targetId/metadata and connects the actor', async () => {
    const prisma = makePrisma();
    const service = new AuditService(prisma as never);

    await service.record({
      actorId: 'admin-1',
      action: AuditAction.USER_ROLE_SET,
      targetType: 'User',
      targetId: 'user-1',
      metadata: { fromRole: 'USER', toRole: 'MODERATOR' },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: AuditAction.USER_ROLE_SET,
        targetType: 'User',
        targetId: 'user-1',
        metadata: { fromRole: 'USER', toRole: 'MODERATOR' },
        actor: { connect: { id: 'admin-1' } },
      }),
    });
  });

  it('record() writes no actor relation when actorId is null', async () => {
    const prisma = makePrisma();
    const service = new AuditService(prisma as never);

    await service.record({ actorId: null, action: AuditAction.MODEL_ACTIVATE, targetType: 'RiskModel', targetId: 'm1' });

    const call = prisma.auditLog.create.mock.calls[0][0];
    expect(call.data.actor).toBeUndefined();
  });

  it('record() never throws when the write fails — logs instead', async () => {
    const prisma = { auditLog: { create: vi.fn().mockRejectedValue(new Error('db down')) } };
    const service = new AuditService(prisma as never);

    await expect(
      service.record({ actorId: 'a1', action: AuditAction.ENTITY_EDIT, targetType: 'Entity', targetId: 'e1' }),
    ).resolves.toBeUndefined();
  });

  it('redacts metadata keys that look like a secret (password/token/secret/email), case-insensitively', async () => {
    const prisma = makePrisma();
    const service = new AuditService(prisma as never);

    await service.record({
      actorId: 'a1',
      action: AuditAction.USER_DELETE,
      targetType: 'User',
      targetId: 'u1',
      metadata: {
        passwordHash: 'should-never-appear',
        Email: 'should-never-appear@example.com',
        refreshToken: 'should-never-appear',
        apiSecretValue: 'should-never-appear',
        previousHandle: 'fine-to-keep',
      },
    });

    const written = prisma.auditLog.create.mock.calls[0][0].data.metadata as Record<string, unknown>;
    expect(written.passwordHash).toBe('[REDACTED]');
    expect(written.Email).toBe('[REDACTED]');
    expect(written.refreshToken).toBe('[REDACTED]');
    expect(written.apiSecretValue).toBe('[REDACTED]');
    expect(written.previousHandle).toBe('fine-to-keep');
    expect(JSON.stringify(written)).not.toContain('should-never-appear');
  });

  it('write() builds the same auditLog.create args as record(), for splicing into the caller\'s own $transaction array', () => {
    const prisma = makePrisma();
    const service = new AuditService(prisma as never);

    service.write({ actorId: 'a1', action: AuditAction.USER_SELF_DELETE, targetType: 'User', targetId: 'u1' });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: AuditAction.USER_SELF_DELETE, targetType: 'User', targetId: 'u1' }),
      select: { id: true },
    });
  });
});
