import type { Readable } from 'node:stream';

// Local driver always returns a stream; S3 always returns a redirect URL —
// callers (EvidenceController) branch on `kind` to either pipe the stream
// or 302 the client to the signed URL.
export type StorageObject = { kind: 'stream'; stream: Readable } | { kind: 'redirect'; url: string };

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

export interface StorageProvider {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  getObject(key: string): Promise<StorageObject>;
  delete(key: string): Promise<void>;
}
