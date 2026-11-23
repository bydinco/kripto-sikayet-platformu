import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageObject, StorageProvider } from './storage-provider.interface.js';

// Targets Hetzner Object Storage / Cloudflare R2 (S3-compatible). Never
// tested against real credentials in this codebase — see CLAUDE.md. Unit
// tests mock the SDK client; there is no e2e coverage for this driver.
const SIGNED_URL_TTL_SECONDS = 60;

@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('S3_BUCKET')!;
    this.client = new S3Client({
      endpoint: this.config.get<string>('S3_ENDPOINT'),
      region: this.config.get<string>('S3_REGION'),
      // Hetzner/R2 use path-style addressing, not virtual-hosted-style.
      forcePathStyle: true,
      credentials: {
        accessKeyId: this.config.get<string>('S3_ACCESS_KEY_ID')!,
        secretAccessKey: this.config.get<string>('S3_SECRET_ACCESS_KEY')!,
      },
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async getObject(key: string): Promise<StorageObject> {
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: SIGNED_URL_TTL_SECONDS },
    );
    return { kind: 'redirect', url };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
