import type { ConfigService } from '@nestjs/config';
import { S3StorageProvider } from './s3-storage.provider.js';

// Mocked — this driver has never been exercised against a real S3-compatible
// bucket/credentials in this codebase (see CLAUDE.md). These tests only
// confirm S3StorageProvider wires the right commands/params into the SDK.
// vi.mock calls are hoisted above these imports by vitest, so the mocks
// they reference must be created via vi.hoisted too.
const { sendMock, getSignedUrlMock } = vi.hoisted(() => ({
  sendMock: vi.fn().mockResolvedValue({}),
  getSignedUrlMock: vi.fn().mockResolvedValue('https://bucket.example.com/signed?x=1'),
}));
vi.mock('@aws-sdk/client-s3', () => {
  class FakeCommand {
    constructor(public input: unknown) {}
  }
  return {
    S3Client: vi.fn().mockImplementation(function S3Client() {
      return { send: sendMock };
    }),
    PutObjectCommand: FakeCommand,
    GetObjectCommand: FakeCommand,
    DeleteObjectCommand: FakeCommand,
  };
});
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: getSignedUrlMock }));

function fakeConfig(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

const CONFIG = {
  S3_ENDPOINT: 'https://fake-endpoint.example.com',
  S3_BUCKET: 'evidence-bucket',
  S3_REGION: 'eu-central',
  S3_ACCESS_KEY_ID: 'fake-key',
  S3_SECRET_ACCESS_KEY: 'fake-secret',
};

describe('S3StorageProvider (SDK mocked — never tested against a real bucket)', () => {
  beforeEach(() => {
    sendMock.mockClear();
    getSignedUrlMock.mockClear();
  });

  it('put() sends a PutObjectCommand with the bucket/key/body/contentType', async () => {
    const provider = new S3StorageProvider(fakeConfig(CONFIG));
    await provider.put('evidence/a.png', Buffer.from('x'), 'image/png');
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0].input).toMatchObject({
      Bucket: 'evidence-bucket',
      Key: 'evidence/a.png',
      ContentType: 'image/png',
    });
  });

  it('getObject() returns a short-lived redirect to a presigned GET URL', async () => {
    const provider = new S3StorageProvider(fakeConfig(CONFIG));
    const result = await provider.getObject('evidence/a.png');
    expect(result).toEqual({ kind: 'redirect', url: 'https://bucket.example.com/signed?x=1' });
    expect(getSignedUrlMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ input: { Bucket: 'evidence-bucket', Key: 'evidence/a.png' } }),
      { expiresIn: 60 },
    );
  });

  it('delete() sends a DeleteObjectCommand for the key', async () => {
    const provider = new S3StorageProvider(fakeConfig(CONFIG));
    await provider.delete('evidence/a.png');
    expect(sendMock.mock.calls[0][0].input).toMatchObject({ Bucket: 'evidence-bucket', Key: 'evidence/a.png' });
  });
});
