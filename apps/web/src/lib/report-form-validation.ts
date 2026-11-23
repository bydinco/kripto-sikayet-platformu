export type MissingReportField = 'entity' | 'title' | 'body' | 'consent';

// Pure, so the "why is submit disabled" hint in ReportForm and the
// disabled condition itself can never disagree with each other.
export function getMissingReportFields(input: {
  hasEntity: boolean;
  title: string;
  body: string;
  consent: boolean;
}): MissingReportField[] {
  const missing: MissingReportField[] = [];
  if (!input.hasEntity) missing.push('entity');
  if (input.title.trim().length === 0) missing.push('title');
  if (input.body.trim().length === 0) missing.push('body');
  if (!input.consent) missing.push('consent');
  return missing;
}
