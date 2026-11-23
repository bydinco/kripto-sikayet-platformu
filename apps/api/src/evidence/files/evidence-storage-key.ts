import { randomUUID } from 'node:crypto';
import type { AllowedEvidenceMimeType } from './evidence-file.constants.js';

const EXT_BY_MIME: Record<AllowedEvidenceMimeType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

// Random and unguessable, never derived from the user's filename or
// report/user id — see CLAUDE.md "Kanıt dosyası depolama".
export function generateEvidenceStorageKey(mimeType: AllowedEvidenceMimeType): string {
  return `evidence/${randomUUID()}.${EXT_BY_MIME[mimeType]}`;
}
