// v1 only: static images. PDF/video are explicitly out of scope (see
// CLAUDE.md) — they need their own content-sniffing/sanitization story.
export const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type AllowedEvidenceMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_FILES_PER_REPORT = 5;
// Burst control is the @Throttle decorator on the endpoint; this is the
// separate per-user daily ceiling across all reports.
export const DAILY_FILE_UPLOAD_QUOTA = 20;

export function isAllowedMimeType(mime: string): mime is AllowedEvidenceMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mime);
}
