import { ModerationAction, ReportStatus } from '@prisma/client';

const { PENDING, NEEDS_EVIDENCE, PUBLISHED, DISPUTED, RESOLVED, REJECTED, REMOVED } = ReportStatus;

export const REPORT_TRANSITIONS: Record<ReportStatus, ReportStatus[]> = {
  [PENDING]: [NEEDS_EVIDENCE, PUBLISHED, REJECTED],
  [NEEDS_EVIDENCE]: [REJECTED],
  [PUBLISHED]: [DISPUTED, RESOLVED, REMOVED],
  [DISPUTED]: [PUBLISHED, RESOLVED, REMOVED],
  [RESOLVED]: [REMOVED],
  [REJECTED]: [PENDING],
  [REMOVED]: [PUBLISHED],
};

function key(from: ReportStatus, to: ReportStatus): string {
  return `${from}->${to}`;
}

// REMOVED->PUBLISHED (restore) and REJECTED->PENDING (reopen) are
// consequential enough that only ADMIN, not every MODERATOR, may do them.
export const ADMIN_ONLY_TRANSITIONS = new Set<string>([key(REMOVED, PUBLISHED), key(REJECTED, PENDING)]);

export function isValidTransition(from: ReportStatus, to: ReportStatus): boolean {
  return REPORT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isAdminOnlyTransition(from: ReportStatus, to: ReportStatus): boolean {
  return ADMIN_ONLY_TRANSITIONS.has(key(from, to));
}

export function assertValidTransition(from: ReportStatus, to: ReportStatus): void {
  if (!isValidTransition(from, to)) {
    throw new Error(`Invalid report status transition: ${from} -> ${to}`);
  }
}

// Best-effort mapping onto the existing ModerationAction enum, which has no
// dedicated value for every edge (e.g. "dispute" or "reopen"); EDIT is used
// as the generic fallback for those.
const ACTION_FOR_TRANSITION: Record<string, ModerationAction> = {
  [key(PENDING, NEEDS_EVIDENCE)]: ModerationAction.REQUEST_EVIDENCE,
  [key(PENDING, PUBLISHED)]: ModerationAction.APPROVE,
  [key(PENDING, REJECTED)]: ModerationAction.REJECT,
  [key(NEEDS_EVIDENCE, REJECTED)]: ModerationAction.REJECT,
  [key(PUBLISHED, DISPUTED)]: ModerationAction.EDIT,
  [key(PUBLISHED, RESOLVED)]: ModerationAction.APPROVE,
  [key(PUBLISHED, REMOVED)]: ModerationAction.REMOVE,
  [key(DISPUTED, PUBLISHED)]: ModerationAction.APPROVE,
  [key(DISPUTED, RESOLVED)]: ModerationAction.APPROVE,
  [key(DISPUTED, REMOVED)]: ModerationAction.REMOVE,
  [key(RESOLVED, REMOVED)]: ModerationAction.REMOVE,
  [key(REJECTED, PENDING)]: ModerationAction.EDIT,
  [key(REMOVED, PUBLISHED)]: ModerationAction.RESTORE,
};

export function moderationActionFor(from: ReportStatus, to: ReportStatus): ModerationAction {
  const action = ACTION_FOR_TRANSITION[key(from, to)];
  if (!action) {
    throw new Error(`No ModerationAction mapped for transition: ${from} -> ${to}`);
  }
  return action;
}
