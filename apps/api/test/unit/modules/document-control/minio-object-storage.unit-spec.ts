jest.mock('@aws-sdk/client-s3', () => {
  class RecordedCommand {
    constructor(public readonly input: Record<string, unknown>) {}
  }
  return {
    S3Client: jest.fn(),
    PutObjectCommand: class PutObjectCommand extends RecordedCommand {},
    GetObjectCommand: class GetObjectCommand extends RecordedCommand {},
    CopyObjectCommand: class CopyObjectCommand extends RecordedCommand {},
    DeleteObjectCommand: class DeleteObjectCommand extends RecordedCommand {},
    HeadObjectCommand: class HeadObjectCommand extends RecordedCommand {},
    HeadBucketCommand: class HeadBucketCommand extends RecordedCommand {},
    CreateBucketCommand: class CreateBucketCommand extends RecordedCommand {}
  };
});

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
import { Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { AppConfig } from 'src/config/environment';
import { MinioObjectStorage } from 'src/modules/document-control/minio-object-storage.service';

const QUARANTINE = 'solar-bess-quarantine';
const RELEASE = 'solar-bess-documents';

const clientConstructor = S3Client as unknown as jest.Mock;
const send = jest.fn();
const destroy = jest.fn();

function storageConfig(): AppConfig {
  return {
    objectStorage: {
      endpoint: 'http://minio:9000',
      region: 'us-east-1',
      quarantineBucket: QUARANTINE,
      releaseBucket: RELEASE,
      connectTimeoutMs: 5_000,
      requestTimeoutMs: 30_000,
      accessKey: 'minio-access-key-2f6c1d8b0a',
      secretKey: 'minio-secret-key-9d3f7ac1be5240fa8c7b'
    }
  } as unknown as AppConfig;
}

function storage(): MinioObjectStorage {
  return new MinioObjectStorage(storageConfig());
}

function notFound(): Error {
  return Object.assign(new Error('Not Found'), {
    name: 'NotFound',
    $metadata: { httpStatusCode: 404 }
  });
}

function commandsSent(): any[] {
  return send.mock.calls.map((call) => call[0]);
}

beforeEach(() => {
  send.mockReset();
  destroy.mockReset();
  clientConstructor.mockReset();
  clientConstructor.mockImplementation(() => ({ send, destroy }));
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('MinioObjectStorage — ADR-005 object storage adapter', () => {
  it('talks to the configured MinIO endpoint in path style with the decrypted credentials', () => {
    storage();
    expect(clientConstructor).toHaveBeenCalledTimes(1);
    expect(clientConstructor.mock.calls[0][0]).toMatchObject({
      endpoint: 'http://minio:9000',
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: 'minio-access-key-2f6c1d8b0a',
        secretAccessKey: 'minio-secret-key-9d3f7ac1be5240fa8c7b'
      },
      requestHandler: { connectionTimeout: 5_000, requestTimeout: 30_000 }
    });
  });

  it('exposes the quarantine and release buckets from configuration', () => {
    const adapter = storage();
    expect(adapter.quarantineBucket()).toBe(QUARANTINE);
    expect(adapter.releaseBucket()).toBe(RELEASE);
  });

  it('derives sha256 and size from the bytes it stored, not from any caller claim', async () => {
    send.mockResolvedValue({});
    const body = Buffer.from('quarantined revision bytes for ADR-005', 'utf8');
    const expected = createHash('sha256').update(body).digest();

    const result = await storage().put(
      { bucket: QUARANTINE, objectKey: 'tenant/a/revision/1.bin' }, body, 'application/pdf'
    );

    expect(result).toEqual({
      bucket: QUARANTINE,
      objectKey: 'tenant/a/revision/1.bin',
      sha256: expected.toString('hex'),
      sizeBytes: body.length,
      contentType: 'application/pdf'
    });
    // A hash of any other byte sequence must not be reachable from put().
    expect(result.sha256).not.toBe(createHash('sha256').update('different bytes').digest('hex'));

    const command = commandsSent()[0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: QUARANTINE,
      Key: 'tenant/a/revision/1.bin',
      ContentType: 'application/pdf',
      ContentLength: body.length,
      // MinIO re-hashes the payload and rejects the write if it does not match.
      ChecksumSHA256: expected.toString('base64')
    });
    expect(Buffer.compare(command.input.Body as Buffer, body)).toBe(0);
  });

  it('hashes an empty upload without inventing a length', async () => {
    send.mockResolvedValue({});
    const result = await storage().put(
      { bucket: QUARANTINE, objectKey: 'empty' }, Buffer.alloc(0), 'application/octet-stream'
    );
    expect(result.sizeBytes).toBe(0);
    expect(result.sha256).toBe(createHash('sha256').update(Buffer.alloc(0)).digest('hex'));
  });

  it('returns the stored bytes for get', async () => {
    const bytes = Uint8Array.from([0x25, 0x50, 0x44, 0x46]);
    send.mockResolvedValue({ Body: { transformToByteArray: async () => bytes } });

    const body = await storage().get({ bucket: RELEASE, objectKey: 'released.pdf' });

    expect(Buffer.compare(body, Buffer.from(bytes))).toBe(0);
    expect(commandsSent()[0]).toBeInstanceOf(GetObjectCommand);
  });

  it('promotes by copying quarantine into release and then deleting the quarantine object', async () => {
    send.mockResolvedValue({});

    const released = await storage().promote(
      { bucket: QUARANTINE, objectKey: 'tenant a/rev 1.pdf' },
      { bucket: RELEASE, objectKey: 'tenant a/rev 1.pdf' }
    );

    expect(released).toEqual({ bucket: RELEASE, objectKey: 'tenant a/rev 1.pdf' });
    const [copy, remove] = commandsSent();
    expect(copy).toBeInstanceOf(CopyObjectCommand);
    expect(copy.input).toEqual({
      Bucket: RELEASE,
      Key: 'tenant a/rev 1.pdf',
      CopySource: `${QUARANTINE}/tenant%20a/rev%201.pdf`
    });
    expect(remove).toBeInstanceOf(DeleteObjectCommand);
    expect(remove.input).toEqual({ Bucket: QUARANTINE, Key: 'tenant a/rev 1.pdf' });
  });

  it('refuses any promotion that is not quarantine into release', async () => {
    send.mockResolvedValue({});
    const adapter = storage();

    await expect(adapter.promote(
      { bucket: RELEASE, objectKey: 'k' }, { bucket: QUARANTINE, objectKey: 'k' }
    )).rejects.toThrow('promote must copy from');
    await expect(adapter.promote(
      { bucket: QUARANTINE, objectKey: 'k' }, { bucket: 'someone-elses-bucket', objectKey: 'k' }
    )).rejects.toThrow('promote must copy from');
    expect(send).not.toHaveBeenCalled();
  });

  it('leaves the quarantine object in place when the copy fails', async () => {
    send.mockRejectedValueOnce(new Error('copy failed'));

    await expect(storage().promote(
      { bucket: QUARANTINE, objectKey: 'k' }, { bucket: RELEASE, objectKey: 'k' }
    )).rejects.toThrow('copy failed');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('deletes an object on remove', async () => {
    send.mockResolvedValue({});
    await storage().remove({ bucket: QUARANTINE, objectKey: 'k' });
    const command = commandsSent()[0];
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input).toEqual({ Bucket: QUARANTINE, Key: 'k' });
  });

  it('reports existence, treats 404 as absent and lets a transport failure surface', async () => {
    send.mockResolvedValueOnce({});
    await expect(storage().exists({ bucket: RELEASE, objectKey: 'k' })).resolves.toBe(true);
    expect(commandsSent()[0]).toBeInstanceOf(HeadObjectCommand);

    send.mockRejectedValueOnce(notFound());
    await expect(storage().exists({ bucket: RELEASE, objectKey: 'k' })).resolves.toBe(false);

    // A storage outage must not be reported as a missing object.
    send.mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.5:9000'));
    await expect(storage().exists({ bucket: RELEASE, objectKey: 'k' })).rejects.toThrow('ECONNREFUSED');
  });

  it('creates only the missing buckets during bootstrap', async () => {
    send.mockResolvedValueOnce({});
    send.mockRejectedValueOnce(notFound());
    send.mockResolvedValueOnce({});

    await storage().onModuleInit();

    const sent = commandsSent();
    expect(sent[0]).toBeInstanceOf(HeadBucketCommand);
    expect(sent[0].input).toEqual({ Bucket: QUARANTINE });
    expect(sent[1]).toBeInstanceOf(HeadBucketCommand);
    expect(sent[2]).toBeInstanceOf(CreateBucketCommand);
    expect(sent[2].input).toEqual({ Bucket: RELEASE });
  });

  it('never blocks application start-up when MinIO is unreachable', async () => {
    send.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:9000'));
    await expect(storage().onModuleInit()).resolves.toBeUndefined();
  });

  it('destroys the client on shutdown', () => {
    storage().onApplicationShutdown();
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
