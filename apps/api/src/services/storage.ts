import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Config } from '../config.js';

export const SIGNED_URL_TTL_S = 15 * 60;

export interface Storage {
  put(key: string, body: Uint8Array | string, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  signedUrl(key: string, filename?: string): Promise<string>;
}

/** S3-compatible storage (MinIO locally, any S3 in production). */
export class S3Storage implements Storage {
  private readonly s3: S3Client;
  private ready: Promise<void> | null = null;
  constructor(private readonly cfg: Config) {
    this.s3 = new S3Client({
      region: cfg.S3_REGION,
      endpoint: cfg.S3_ENDPOINT,
      forcePathStyle: true,
      credentials: { accessKeyId: cfg.S3_ACCESS_KEY ?? '', secretAccessKey: cfg.S3_SECRET_KEY ?? '' },
    });
  }
  private ensureBucket() {
    this.ready ??= this.s3
      .send(new HeadBucketCommand({ Bucket: this.cfg.S3_BUCKET }))
      .then(() => undefined)
      .catch(async () => {
        await this.s3.send(new CreateBucketCommand({ Bucket: this.cfg.S3_BUCKET }));
      });
    return this.ready;
  }
  async put(key: string, body: Uint8Array | string, contentType: string) {
    await this.ensureBucket();
    await this.s3.send(new PutObjectCommand({ Bucket: this.cfg.S3_BUCKET, Key: key, Body: body, ContentType: contentType }));
  }
  async get(key: string) {
    const r = await this.s3.send(new GetObjectCommand({ Bucket: this.cfg.S3_BUCKET, Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }
  async signedUrl(key: string, filename?: string) {
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.cfg.S3_BUCKET,
        Key: key,
        ...(filename ? { ResponseContentDisposition: `attachment; filename="${filename}"` } : {}),
      }),
      { expiresIn: SIGNED_URL_TTL_S },
    );
  }
}

/** Local filesystem storage for development and tests, with HMAC-signed download URLs served by the API. */
export class FsStorage implements Storage {
  private readonly root: string;
  constructor(private readonly cfg: Config) {
    this.root = resolve(cfg.STORAGE_DIR);
  }
  private path(key: string) {
    const p = resolve(join(this.root, key));
    if (!p.startsWith(this.root)) throw new Error('Invalid key');
    return p;
  }
  async put(key: string, body: Uint8Array | string) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, body);
  }
  async get(key: string) {
    return readFile(this.path(key));
  }
  sign(key: string, exp: number) {
    return createHmac('sha256', this.cfg.BETTER_AUTH_SECRET).update(`${key}:${exp}`).digest('hex');
  }
  verify(key: string, exp: number, sig: string, nowS: number) {
    if (exp < nowS) return false;
    const a = Buffer.from(this.sign(key, exp));
    const b = Buffer.from(sig);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  async signedUrl(key: string, filename?: string) {
    const exp = Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_S;
    const q = new URLSearchParams({ key, exp: String(exp), sig: this.sign(key, exp) });
    if (filename) q.set('name', filename);
    return `${this.cfg.API_PUBLIC_URL}/api/v1/files?${q}`;
  }
}

export function createStorage(cfg: Config): Storage {
  return cfg.S3_ENDPOINT ? new S3Storage(cfg) : new FsStorage(cfg);
}
