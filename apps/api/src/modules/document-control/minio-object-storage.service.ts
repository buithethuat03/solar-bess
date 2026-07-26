import {
  CopyObjectCommand,
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import { Inject, Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { APP_CONFIG } from '../../config/configuration.module';
import type { AppConfig } from '../../config/environment';
import type { ObjectStorage, PutResult, StoredObjectRef } from './object-storage.port';

/**
 * S3 URL-decodes `x-amz-copy-source`, so every path segment is encoded individually and the
 * bucket/key separator is preserved. Object keys that contain `/` keep their prefix structure.
 */
function copySource(ref: StoredObjectRef): string {
  return `${ref.bucket}/${ref.objectKey}`.split('/').map(encodeURIComponent).join('/');
}

/**
 * MinIO and S3 report a missing object or bucket in several shapes depending on the operation, so
 * the adapter matches on the error name and the HTTP status rather than on SDK exception classes.
 */
function isNotFound(error: unknown): boolean {
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } } | null;
  if (!candidate) return false;
  if (candidate.name === 'NotFound' || candidate.name === 'NoSuchKey' || candidate.name === 'NoSuchBucket') {
    return true;
  }
  return candidate.$metadata?.httpStatusCode === 404;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * ADR-005 object storage adapter for MinIO. MinIO exposes buckets as the first path segment instead
 * of a DNS label, so the client is forced into path style and pointed at an explicit endpoint.
 */
@Injectable()
export class MinioObjectStorage implements ObjectStorage, OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(MinioObjectStorage.name);
  private readonly client: S3Client;
  private readonly quarantine: string;
  private readonly release: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    const storage = config.objectStorage;
    this.quarantine = storage.quarantineBucket;
    this.release = storage.releaseBucket;
    // Reading the enc:v1 envelopes here makes a missing or malformed credential fail when the
    // container starts, not when the first document upload reaches the adapter.
    const credentials = {
      accessKeyId: storage.accessKey,
      secretAccessKey: storage.secretKey
    };
    this.client = new S3Client({
      endpoint: storage.endpoint,
      region: storage.region,
      forcePathStyle: true,
      credentials,
      maxAttempts: 3,
      requestHandler: {
        connectionTimeout: storage.connectTimeoutMs,
        requestTimeout: storage.requestTimeoutMs
      }
    });
  }

  /**
   * Best effort bucket bootstrap. A storage outage must not stop the API from booting: uploads fail
   * loudly on their own, and quarantined revisions simply stay quarantined.
   */
  async onModuleInit(): Promise<void> {
    for (const bucket of [this.quarantine, this.release]) {
      try {
        await this.ensureBucket(bucket);
      } catch (error) {
        this.logger.warn(`Object storage bucket ${bucket} is not ready: ${describeError(error)}`);
      }
    }
  }

  onApplicationShutdown(): void {
    this.client.destroy();
  }

  quarantineBucket(): string {
    return this.quarantine;
  }

  releaseBucket(): string {
    return this.release;
  }

  async put(ref: StoredObjectRef, body: Buffer, contentType: string): Promise<PutResult> {
    // The digest and the size describe the exact buffer handed to the SDK. A caller-supplied hash is
    // never accepted, and ChecksumSHA256 makes MinIO reject the write if the bytes differ on arrival.
    const digest = createHash('sha256').update(body).digest();
    await this.client.send(new PutObjectCommand({
      Bucket: ref.bucket,
      Key: ref.objectKey,
      Body: body,
      ContentType: contentType,
      ContentLength: body.length,
      ChecksumSHA256: digest.toString('base64')
    }));
    return {
      bucket: ref.bucket,
      objectKey: ref.objectKey,
      sha256: digest.toString('hex'),
      sizeBytes: body.length,
      contentType
    };
  }

  async get(ref: StoredObjectRef): Promise<Buffer> {
    const response = await this.client.send(new GetObjectCommand({
      Bucket: ref.bucket,
      Key: ref.objectKey
    }));
    if (!response.Body) throw new Error(`Object ${ref.bucket}/${ref.objectKey} has no readable body`);
    return Buffer.from(await response.Body.transformToByteArray());
  }

  async promote(from: StoredObjectRef, to: StoredObjectRef): Promise<StoredObjectRef> {
    // Promotion only ever runs one way. Any other direction would let unscanned bytes reach a
    // released object key, which is exactly the failure ADR-005 quarantines against.
    if (from.bucket !== this.quarantine || to.bucket !== this.release) {
      throw new Error(
        `promote must copy from ${this.quarantine} into ${this.release}, not from ${from.bucket} into ${to.bucket}`
      );
    }
    await this.client.send(new CopyObjectCommand({
      Bucket: to.bucket,
      Key: to.objectKey,
      CopySource: copySource(from)
    }));
    await this.client.send(new DeleteObjectCommand({ Bucket: from.bucket, Key: from.objectKey }));
    return { bucket: to.bucket, objectKey: to.objectKey };
  }

  async remove(ref: StoredObjectRef): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: ref.bucket, Key: ref.objectKey }));
  }

  async exists(ref: StoredObjectRef): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: ref.bucket, Key: ref.objectKey }));
      return true;
    } catch (error) {
      // Only a genuine "missing" answer means false. A transport failure must surface, otherwise a
      // storage outage would look like a deleted object.
      if (isNotFound(error)) return false;
      throw error;
    }
  }

  private async ensureBucket(bucket: string): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
      return;
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
    await this.client.send(new CreateBucketCommand({ Bucket: bucket }));
  }
}
