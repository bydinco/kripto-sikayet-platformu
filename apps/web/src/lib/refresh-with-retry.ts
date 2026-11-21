export interface RefreshOutcome<T = unknown> {
  ok: boolean;
  data?: T;
}

// A refresh that 401s isn't necessarily a dead session: another tab may
// have just rotated the same httpOnly cookie a moment ago. So a single
// 401 doesn't log the user out immediately — wait briefly and try once
// more before giving up. `doRefresh`/`wait` are injected so this stays a
// pure, DOM-free function that's cheap to unit test.
export async function refreshWithRetry<T = unknown>(
  doRefresh: () => Promise<RefreshOutcome<T>>,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  retryDelayMs = 500,
): Promise<RefreshOutcome<T>> {
  const first = await doRefresh();
  if (first.ok) return first;

  await wait(retryDelayMs);
  return doRefresh();
}
