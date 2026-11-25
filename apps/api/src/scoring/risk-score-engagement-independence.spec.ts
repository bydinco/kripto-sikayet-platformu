import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The risk score must never be influenced by votes/me-too/comments (a
// user-manipulable signal) — see CLAUDE.md "Risk skoru motoru". This is a
// static guard, not a DB-backed test: it asserts the scoring source never
// references ReportVote/ReportComment at all, so a future change can't
// accidentally wire engagement into gatherInputs without this test
// noticing immediately.
function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf-8');
}

describe('risk score engine / scoring service: engagement independence', () => {
  it('risk-score-engine.ts never references ReportVote or ReportComment', () => {
    const source = readSource('./risk-score-engine.ts');
    expect(source).not.toMatch(/reportVote|ReportVote|reportComment|ReportComment/);
  });

  it('scoring.service.ts (gatherInputs and its helpers) never references ReportVote or ReportComment', () => {
    const source = readSource('./scoring.service.ts');
    expect(source).not.toMatch(/reportVote|ReportVote|reportComment|ReportComment/);
  });
});
