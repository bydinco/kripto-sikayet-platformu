import net from 'node:net';
import { waitForPostgres } from './wait-for-postgres.js';

function listenOnEphemeralPort(): Promise<{ server: net.Server; port: number }> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('expected an AddressInfo');
      resolve({ server, port: address.port });
    });
  });
}

describe('waitForPostgres', () => {
  it('resolves immediately once the port is already accepting connections', async () => {
    const { server, port } = await listenOnEphemeralPort();
    try {
      await expect(
        waitForPostgres(`postgresql://127.0.0.1:${port}/db`, { timeoutMs: 5_000, retryDelayMs: 100 }),
      ).resolves.toBeUndefined();
    } finally {
      server.close();
    }
  });

  it('retries and resolves once something starts listening partway through', async () => {
    const { server, port } = await listenOnEphemeralPort();
    server.close(); // free the port, but don't listen yet

    const waitPromise = waitForPostgres(`postgresql://127.0.0.1:${port}/db`, {
      timeoutMs: 5_000,
      retryDelayMs: 150,
    });

    // Start listening again shortly after the first attempt would have
    // failed — proves this is a genuine retry, not a lucky first probe.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const retryServer = net.createServer();
    await new Promise<void>((resolve) => retryServer.listen(port, '127.0.0.1', resolve));

    try {
      await expect(waitPromise).resolves.toBeUndefined();
    } finally {
      retryServer.close();
    }
  });

  it('rejects once the timeout elapses with nothing ever listening', async () => {
    const { server, port } = await listenOnEphemeralPort();
    server.close(); // nothing listens on this port for the rest of the test

    await expect(
      waitForPostgres(`postgresql://127.0.0.1:${port}/db`, { timeoutMs: 400, retryDelayMs: 100 }),
    ).rejects.toThrow(/bağlantı kabul etmedi/);
  });
});
