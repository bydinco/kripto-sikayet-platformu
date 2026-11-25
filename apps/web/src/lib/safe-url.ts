// Only ever render a user-controlled URL (evidence LINK value, EntityLink
// url) as a clickable anchor when it's genuinely http(s) — the backend
// already enforces this at creation time (CreateEntityLinkDto's @IsUrl,
// the report-form's evidence validation), this is a second, independent
// check at render time.
export function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
