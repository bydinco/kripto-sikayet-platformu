import { refreshWithRetry } from './refresh-with-retry';

describe('refreshWithRetry', () => {
  it('returns immediately on the first success, without waiting or retrying', async () => {
    const doRefresh = vi.fn().mockResolvedValue({ ok: true });
    const wait = vi.fn().mockResolvedValue(undefined);

    const result = await refreshWithRetry(doRefresh, wait);

    expect(result.ok).toBe(true);
    expect(doRefresh).toHaveBeenCalledOnce();
    expect(wait).not.toHaveBeenCalled();
  });

  it('waits and retries once after a 401, succeeding on the second attempt', async () => {
    const doRefresh = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });
    const wait = vi.fn().mockResolvedValue(undefined);

    const result = await refreshWithRetry(doRefresh, wait, 500);

    expect(result.ok).toBe(true);
    expect(doRefresh).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(500);
  });

  it('gives up (not ok) after a second consecutive failure', async () => {
    const doRefresh = vi.fn().mockResolvedValue({ ok: false });
    const wait = vi.fn().mockResolvedValue(undefined);

    const result = await refreshWithRetry(doRefresh, wait);

    expect(result.ok).toBe(false);
    expect(doRefresh).toHaveBeenCalledTimes(2);
  });
});
