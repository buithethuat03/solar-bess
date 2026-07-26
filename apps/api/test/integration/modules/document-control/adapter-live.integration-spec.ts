import { createHash, randomUUID } from 'node:crypto';
import { loadAppConfig, type AppConfig } from 'src/config/environment';
import { ClamAvMalwareScanner } from 'src/modules/document-control/clamav-malware-scanner.service';
import { MinioObjectStorage } from 'src/modules/document-control/minio-object-storage.service';

/**
 * ADR-005 — the only suite that speaks the real wire protocols. Every other document-control test
 * binds in-memory fakes to `OBJECT_STORAGE` and `MALWARE_SCANNER`, which proves the service logic
 * but nothing about the adapters, so a broken S3 signature or a mis-framed INSTREAM body would ship
 * green. It runs against the `minio-test` and `clamav-test` containers from docker-compose.test.yml.
 */

/**
 * The standard EICAR anti-malware test string, assembled at runtime so the repository itself never
 * contains a byte sequence that an endpoint scanner would quarantine.
 */
const EICAR = [
  'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-', 'ANTIVIRUS-TEST-FILE!$H+H*'
].join('');

describe('ADR-005 storage and scanner adapters against live containers', () => {
  let config: AppConfig;
  let storage: MinioObjectStorage;
  let scanner: ClamAvMalwareScanner;

  beforeAll(async () => {
    config = loadAppConfig();
    storage = new MinioObjectStorage(config);
    scanner = new ClamAvMalwareScanner(config);
    await storage.onModuleInit();
  }, 60_000);

  afterAll(async () => {
    await storage.onApplicationShutdown();
  });

  it('bootstraps two distinct buckets and round-trips bytes with a server-computed hash', async () => {
    const quarantine = storage.quarantineBucket();
    const release = storage.releaseBucket();
    expect(quarantine).not.toBe(release);

    const body = Buffer.from(`round-trip-${randomUUID()}`, 'utf8');
    const ref = { bucket: quarantine, objectKey: `test/${randomUUID()}.txt` };
    const put = await storage.put(ref, body, 'text/plain');

    // The hash must come from the bytes the store actually holds, never from anything the caller
    // supplied, otherwise a client could certify its own upload.
    expect(put.sha256).toBe(createHash('sha256').update(body).digest('hex'));
    expect(put.sizeBytes).toBe(body.length);
    expect(await storage.get(ref)).toEqual(body);
    expect(await storage.exists(ref)).toBe(true);

    await storage.remove(ref);
    expect(await storage.exists(ref)).toBe(false);
  }, 60_000);

  it('promotes quarantine to release, drops the quarantine copy, and refuses the reverse', async () => {
    const quarantine = storage.quarantineBucket();
    const release = storage.releaseBucket();
    const body = Buffer.from(`promote-${randomUUID()}`, 'utf8');
    const from = { bucket: quarantine, objectKey: `test/${randomUUID()}.bin` };
    const to = { bucket: release, objectKey: `test/${randomUUID()}.bin` };
    await storage.put(from, body, 'application/octet-stream');

    const promoted = await storage.promote(from, to);
    expect(promoted).toEqual(to);
    expect(await storage.get(promoted)).toEqual(body);
    // Leaving the quarantine copy behind would keep an unvetted-looking object reachable.
    expect(await storage.exists(from)).toBe(false);

    // Copying release → quarantine would let already-released bytes re-enter the unscanned path.
    await expect(storage.promote(to, from)).rejects.toThrow(/promote must copy from/);
    await storage.remove(promoted);
  }, 60_000);

  it('reports a missing object as absent instead of throwing', async () => {
    expect(await storage.exists({
      bucket: storage.quarantineBucket(), objectKey: `test/${randomUUID()}/absent`
    })).toBe(false);
  }, 30_000);

  it('scans harmless bytes CLEAN and carries no signature', async () => {
    const result = await scanner.scan(Buffer.from('an ordinary specification document', 'utf8'));
    expect(result.verdict).toBe('CLEAN');
    expect(result.signature).toBeNull();
    expect(result.scannerVersion).toMatch(/ClamAV/i);
  }, 60_000);

  it('frames a multi-chunk INSTREAM body correctly', async () => {
    const large = Buffer.alloc(config.malwareScanner.chunkSizeBytes * 3 + 17, 0x41);
    await expect(scanner.scan(large)).resolves.toMatchObject({ verdict: 'CLEAN' });
  }, 60_000);

  it('detects the EICAR test signature as INFECTED and names it', async () => {
    const result = await scanner.scan(Buffer.from(EICAR, 'utf8'));
    expect(result.verdict).toBe('INFECTED');
    expect(result.signature).toEqual(expect.stringContaining('Eicar'));
  }, 60_000);

  it('degrades to UNAVAILABLE, never CLEAN, when clamd cannot be reached', async () => {
    // Port 1 is reserved and never listening, so this exercises the real connection-failure path.
    const unreachable = new ClamAvMalwareScanner({
      ...config,
      malwareScanner: { ...config.malwareScanner, host: '127.0.0.1', port: 1, timeoutMs: 2_000 }
    });
    const result = await unreachable.scan(Buffer.from('anything', 'utf8'));
    expect(result.verdict).toBe('UNAVAILABLE');
    expect(result.signature).not.toBeNull();
  }, 30_000);
});
