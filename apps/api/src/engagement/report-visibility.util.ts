import { Role, ReportStatus } from '@prisma/client';
import { isPublicStatus } from '../reports/report-state-machine.js';
import type { JwtPayload } from '../common/types/jwt-payload.interface.js';

export function isModerator(role: Role): boolean {
  return role === Role.ADMIN || role === Role.MODERATOR;
}

// Same visibility rule as reports.service.ts's canView and
// responses.service.ts's canView (both built on isPublicStatus) — kept as
// its own copy here rather than importing either, since neither is
// exported and this change must not touch those two files.
export function canViewReport(report: { status: ReportStatus; authorId: string }, currentUser?: JwtPayload): boolean {
  if (isPublicStatus(report.status)) return true;
  if (!currentUser) return false;
  return isModerator(currentUser.role) || report.authorId === currentUser.sub;
}
