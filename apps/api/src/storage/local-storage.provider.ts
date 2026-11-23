import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { StorageObject, StorageProvider } from './storage-provider.interface.js';

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly baseDir: string;

  constructor(private readonly config: ConfigService) {
    // Never the web app's public folder — files here are private by
    // default and served only through the authorized API endpoint.
    this.baseDir = resolve(this.config.get<string>('STORAGE_LOCAL_DIR') ?? './storage-local');
  }

  // Defense in depth: storageKey is always server-generated (see
  // generateStorageKey), never derived from user input, but this still
  // refuses to resolve outside baseDir rather than trust that blindly.
  private resolvePath(key: string): string {
    const resolved = resolve(this.baseDir, key);
    if (resolved !== this.baseDir && !resolved.startsWith(this.baseDir + sep)) {
      throw new Error(`Refusing to resolve storage key outside base dir: ${key}`);
    }
    return resolved;
  }

  async put(key: string, body: Buffer): Promise<void> {
    const path = this.resolvePath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  async getObject(key: string): Promise<StorageObject> {
    const path = this.resolvePath(key);
    return { kind: 'stream', stream: createReadStream(path) };
  }

  async delete(key: string): Promise<void> {
    const path = this.resolvePath(key);
    try {
      await rm(path, { force: true });
    } catch (error) {
      this.logger.warn(`Yerel depodan silme başarısız: ${key}`, error instanceof Error ? error.stack : String(error));
    }
  }
}
