async function healthcheck(): Promise<void> {
  const rawPort = process.env.WORKER_HEALTH_PORT?.trim() || '3001';
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('Invalid WORKER_HEALTH_PORT');
  const response = await fetch(`http://127.0.0.1:${port}/ready`, {
    signal: AbortSignal.timeout(2_500),
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`Worker readiness returned ${response.status}`);
}

void healthcheck().catch(() => {
  process.exitCode = 1;
});
