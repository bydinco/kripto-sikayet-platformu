import { ReportStatus } from '@prisma/client';
import {
  assertValidTransition,
  isAdminOnlyTransition,
  isValidTransition,
  moderationActionFor,
} from './report-state-machine.js';

const { PENDING, NEEDS_EVIDENCE, PUBLISHED, DISPUTED, RESOLVED, REJECTED, REMOVED } = ReportStatus;

describe('report-state-machine', () => {
  const validEdges: [ReportStatus, ReportStatus][] = [
    [PENDING, NEEDS_EVIDENCE],
    [PENDING, PUBLISHED],
    [PENDING, REJECTED],
    [NEEDS_EVIDENCE, REJECTED],
    [PUBLISHED, DISPUTED],
    [PUBLISHED, RESOLVED],
    [PUBLISHED, REMOVED],
    [DISPUTED, PUBLISHED],
    [DISPUTED, RESOLVED],
    [DISPUTED, REMOVED],
    [RESOLVED, REMOVED],
    [REJECTED, PENDING],
    [REMOVED, PUBLISHED],
  ];

  it.each(validEdges)('allows %s -> %s', (from, to) => {
    expect(isValidTransition(from, to)).toBe(true);
    expect(() => assertValidTransition(from, to)).not.toThrow();
    expect(() => moderationActionFor(from, to)).not.toThrow();
  });

  const invalidEdges: [ReportStatus, ReportStatus][] = [
    [NEEDS_EVIDENCE, PUBLISHED],
    [NEEDS_EVIDENCE, PENDING],
    [REJECTED, PUBLISHED],
    [REMOVED, DISPUTED],
    [RESOLVED, PUBLISHED],
    [PENDING, RESOLVED],
  ];

  it.each(invalidEdges)('rejects %s -> %s', (from, to) => {
    expect(isValidTransition(from, to)).toBe(false);
    expect(() => assertValidTransition(from, to)).toThrow();
  });

  it('marks REMOVED->PUBLISHED and REJECTED->PENDING as admin-only', () => {
    expect(isAdminOnlyTransition(REMOVED, PUBLISHED)).toBe(true);
    expect(isAdminOnlyTransition(REJECTED, PENDING)).toBe(true);
    expect(isAdminOnlyTransition(PENDING, PUBLISHED)).toBe(false);
  });
});
