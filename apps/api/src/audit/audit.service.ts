import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export interface AuditRecordInput {
  actorId: string | null;
  action: AuditAction;
  targetType: string;
  targetId: string;
  // Only non-sensitive before/after values — see CLAUDE.md "Genel denetim
  // izi". Keys that look like a secret are redacted defensively below,
  // but callers must not rely on that: never put a password/token/e-mail
  // in here in the first place.
  metadata?: Record<string, unknown>;
}

// Defense-in-depth only — callers are the real guarantee (see CLAUDE.md).
// Matches key names containing these words, case-insensitively.
const SENSITIVE_KEY_PATTERN = /password|token|secret|email/i;

function redactMetadata(metadata: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
  if (!metadata) return undefined;
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    safe[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : value;
  }
  return safe as Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  // For non-critical actions (model activate/deactivate, entity edit):
  // fire-and-forget, never throws — the main operation it's attached to
  // must not fail just because the audit write did.
  async record(input: AuditRecordInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({ data: this.toCreateData(input) });
    } catch (error) {
      this.logger.error(
        `AuditLog.create failed: ${JSON.stringify({ action: input.action, targetType: input.targetType, targetId: input.targetId })}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  // For critical actions (role assignment, user deletion): the write MUST
  // land in the SAME transaction as the operation it's auditing, so
  // "it happened but there's no record" can't occur. Returns the raw
  // Prisma operation (NOT awaited here) to splice into the caller's own
  // `this.prisma.$transaction([...])` array.
  write(input: AuditRecordInput): Prisma.PrismaPromise<{ id: string }> {
    return this.prisma.auditLog.create({ data: this.toCreateData(input), select: { id: true } });
  }

  private toCreateData(input: AuditRecordInput): Prisma.AuditLogCreateInput {
    return {
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: redactMetadata(input.metadata),
      ...(input.actorId ? { actor: { connect: { id: input.actorId } } } : {}),
    };
  }
}

export { AuditAction };
