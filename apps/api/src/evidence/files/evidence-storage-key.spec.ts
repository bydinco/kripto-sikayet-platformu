import { generateEvidenceStorageKey } from './evidence-storage-key.js';

describe('generateEvidenceStorageKey', () => {
  it('is random, unguessable, and carries no user input', () => {
    const a = generateEvidenceStorageKey('image/png');
    const b = generateEvidenceStorageKey('image/png');
    expect(a).not.toBe(b);
    expect(a).toMatch(/^evidence\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/);
  });

  it('picks the extension from the detected mime type, not any filename', () => {
    expect(generateEvidenceStorageKey('image/jpeg')).toMatch(/\.jpg$/);
    expect(generateEvidenceStorageKey('image/webp')).toMatch(/\.webp$/);
  });
});
