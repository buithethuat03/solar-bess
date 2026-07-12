import { loadWorkerConfig } from './config';
import { WorkerRuntime } from './worker-runtime';
import { safeErrorCode } from './safe-error';
import { workerLogger } from './worker-logger';

async function bootstrap(): Promise<void> {
  const runtime = new WorkerRuntime(loadWorkerConfig(), workerLogger);
  let stopping: Promise<void> | null = null;
  const stop = (signal: NodeJS.Signals): void => {
    if (stopping) return;
    workerLogger.info('worker_shutdown_requested', { signal });
    stopping = runtime.stop().catch((error: unknown) => {
      workerLogger.error('worker_shutdown_failed', { errorCode: safeErrorCode(error) });
      process.exitCode = 1;
    });
  };
  process.once('SIGTERM', () => stop('SIGTERM'));
  process.once('SIGINT', () => stop('SIGINT'));
  try {
    await runtime.start();
  } catch (error) {
    await runtime.stop().catch(() => undefined);
    throw error;
  }
}

void bootstrap().catch((error: unknown) => {
  workerLogger.error('worker_start_failed', { errorCode: safeErrorCode(error) });
  process.exitCode = 1;
});
