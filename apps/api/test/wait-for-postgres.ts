import net from 'node:net';

function tryConnect(host: string, port: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port, timeout: timeoutMs });
    socket.once('connect', () => {
      socket.end();
      resolve();
    });
    socket.once('error', (err) => {
      socket.destroy();
      reject(err);
    });
    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error(`connection to ${host}:${port} timed out`));
    });
  });
}

// A freshly-started `docker compose up -d postgres_test` can take a
// moment past its own healthcheck before actually accepting connections
// (especially the very first run against a cold container) — this turns
// that into a short retry instead of a hard failure on the first attempt.
// Only probes that the TCP port accepts a connection, not that Postgres
// itself is ready for queries — good enough to smooth over the startup
// race; `prisma migrate deploy` right after this still has its own retry
// behavior for anything finer-grained.
export async function waitForPostgres(
  databaseUrl: string,
  options: { timeoutMs?: number; retryDelayMs?: number } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const retryDelayMs = options.retryDelayMs ?? 1_000;
  const url = new URL(databaseUrl);
  const host = url.hostname;
  const port = Number(url.port) || 5432;

  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await tryConnect(host, port, 2_000);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
  throw new Error(`Postgres ${host}:${port} ${timeoutMs}ms içinde bağlantı kabul etmedi.`, { cause: lastError });
}
