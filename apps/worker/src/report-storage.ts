import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * Minimal object-storage writer for report exports (US-023 worker side).
 *
 * Mirrors the API's MinIO adapter conventions (path-style, explicit endpoint, checksum on put)
 * but follows the WORKER secret discipline: credentials come from mounted secret files, never
 * from plain environment values. Configuration is loaded lazily on the first put so a worker
 * deployed without MINIO_* wiring still boots — report jobs then fail loudly per event instead
 * of taking the whole consumer down.
 *
 * Required worker environment (compose additions are listed in the delivery report, the compose
 * file itself is deliberately untouched):
 *   MINIO_ENDPOINT (default http://127.0.0.1:9000), MINIO_REGION (default us-east-1),
 *   MINIO_RELEASE_BUCKET (default solar-bess-documents),
 *   MINIO_ACCESS_KEY_FILE (default /run/secrets/minio_access_key),
 *   MINIO_SECRET_KEY_FILE (default /run/secrets/minio_secret_key).
 */

export interface StoredReportRef {
  bucket: string;
  objectKey: string;
}

export interface ReportStorage {
  put(objectKey: string, body: Buffer, contentType: string): Promise<StoredReportRef>;
}

export interface ReportStorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
}

type Environment = Record<string, string | undefined>;
type SecretReader = (path: string) => string;

export function loadReportStorageConfig(
  env: Environment = process.env,
  readSecret: SecretReader = (path) => readFileSync(path, 'utf8')
): ReportStorageConfig {
  const endpoint = env.MINIO_ENDPOINT?.trim() || 'http://127.0.0.1:9000';
  const parsed = new URL(endpoint);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('MINIO_ENDPOINT must be an http(s) URL');
  }
  const bucket = env.MINIO_RELEASE_BUCKET?.trim() || 'solar-bess-documents';
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw new Error('MINIO_RELEASE_BUCKET must be a valid bucket name');
  }
  const region = env.MINIO_REGION?.trim() || 'us-east-1';
  if (!/^[a-z0-9-]{1,32}$/.test(region)) throw new Error('MINIO_REGION must be a region name');
  const secret = (fileVariable: string, fallbackPath: string, minimumLength: number): string => {
    const path = env[fileVariable]?.trim() || fallbackPath;
    const value = readSecret(path).replace(/[\r\n]+$/, '');
    if (value.length < minimumLength) throw new Error(`${fileVariable} secret is too short`);
    return value;
  };
  return {
    endpoint: parsed.toString(),
    region,
    bucket,
    accessKey: secret('MINIO_ACCESS_KEY_FILE', '/run/secrets/minio_access_key', 3),
    secretKey: secret('MINIO_SECRET_KEY_FILE', '/run/secrets/minio_secret_key', 8)
  };
}

export class MinioReportStorage implements ReportStorage {
  private client: S3Client | null = null;
  private config: ReportStorageConfig | null = null;

  constructor(private readonly loadConfig: () => ReportStorageConfig = loadReportStorageConfig) {}

  async put(objectKey: string, body: Buffer, contentType: string): Promise<StoredReportRef> {
    if (!this.config) this.config = this.loadConfig();
    if (!this.client) {
      this.client = new S3Client({
        endpoint: this.config.endpoint,
        region: this.config.region,
        forcePathStyle: true,
        credentials: {
          accessKeyId: this.config.accessKey,
          secretAccessKey: this.config.secretKey
        },
        maxAttempts: 3
      });
    }
    // The checksum describes the exact buffer handed over, so MinIO rejects corrupted bytes.
    const digest = createHash('sha256').update(body).digest('base64');
    await this.client.send(new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: objectKey,
      Body: body,
      ContentType: contentType,
      ContentLength: body.length,
      ChecksumSHA256: digest
    }));
    return { bucket: this.config.bucket, objectKey };
  }
}
