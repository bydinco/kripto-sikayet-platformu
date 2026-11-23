// Client-side pre-check only, mirroring the server's real rules
// (apps/api/src/evidence/files/EvidenceFileService) — the server
// re-validates from actual file content (magic bytes) regardless of what's
// reported here, so this never needs to be airtight, just helpful.
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_FILES = 5;

const ALLOWED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
// Browsers normally report "image/jpeg" for a .jpg file, but that's not
// guaranteed: some file managers / older Windows MIME registrations hand
// back "image/pjpeg", "image/jpg", or an empty string instead. Matching on
// type alone silently drops those files with no error — the extension
// fallback below is what actually fixes that for .jpg specifically.
const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/pjpeg', 'image/jpg', 'image/png', 'image/webp'];

export function getFileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
}

// Accepts by MIME type OR by extension (both checked case-insensitively),
// not only by whichever one happens to be reliable for a given browser/OS/
// file manager — so .JPG, .Jpeg, .png, .WEBP all pass regardless of what
// the browser put in File.type.
export function isAcceptedImageFile(file: { name: string; type: string }): boolean {
  if (ALLOWED_IMAGE_MIME_TYPES.includes(file.type.toLowerCase())) return true;
  return ALLOWED_IMAGE_EXTENSIONS.includes(getFileExtension(file.name));
}
