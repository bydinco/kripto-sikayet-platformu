import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import { LocalStorageProvider } from './local-storage.provider.js';

function fakeConfig(baseDir: string): ConfigService {
  return { get: () => baseDir } as unknown as ConfigService;
}

describe('LocalStorageProvider', () => {
  let baseDir: string;
  let provider: LocalStorageProvider;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'evidence-storage-'));
    provider = new LocalStorageProvider(fakeConfig(baseDir));
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('writes and reads back the same bytes under a nested key', async () => {
    const body = Buffer.from('hello evidence');
    await provider.put('evidence/abc.png', body, 'image/png');

    const object = await provider.getObject('evidence/abc.png');
    expect(object.kind).toBe('stream');
    const chunks: Buffer[] = [];
    if (object.kind === 'stream') {
      for await (const chunk of object.stream) chunks.push(chunk as Buffer);
    }
    expect(Buffer.concat(chunks).toString()).toBe('hello evidence');

    const onDisk = await readFile(join(baseDir, 'evidence/abc.png'));
    expect(onDisk.toString()).toBe('hello evidence');
  });

  it('delete is idempotent (missing file is not an error)', async () => {
    await expect(provider.delete('evidence/never-existed.png')).resolves.toBeUndefined();
  });

  it('refuses a storage key that attempts to escape the base directory', async () => {
    await expect(provider.put('../../etc/passwd', Buffer.from('x'), 'image/png')).rejects.toThrow();
  });
});
