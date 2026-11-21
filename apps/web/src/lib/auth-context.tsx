'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { apiFetch } from './api-client';
import type { ApiUser, LoginResult, RefreshResult } from './api-models';
import { refreshWithRetry } from './refresh-with-retry';

interface AuthState {
  user: ApiUser | null;
  accessToken: string | null;
  status: 'loading' | 'authenticated' | 'anonymous';
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, handle: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const LOCK_NAME = 'kripto-sikayet-auth-refresh';
const BROADCAST_CHANNEL_NAME = 'kripto-sikayet-auth-refresh';
const AUTO_REFRESH_INTERVAL_MS = 12 * 60 * 1000; // access token lives 15 min

async function doRawRefresh(): Promise<RefreshResult | null> {
  try {
    return await apiFetch<RefreshResult>('/auth/refresh', { method: 'POST', credentials: 'include' });
  } catch {
    return null;
  }
}

// Single-flight state lives at module scope, outside React — it must
// survive a StrictMode mount→cleanup→mount and must only be cleared once
// the real network request settles, never by an effect's own cleanup.
let inFlightRefresh: Promise<RefreshResult | null> | null = null;
let broadcastChannel: BroadcastChannel | null | undefined;
let lastSeenPeerRefreshAt = 0;

function getBroadcastChannel(): BroadcastChannel | null {
  if (broadcastChannel !== undefined) return broadcastChannel;
  broadcastChannel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(BROADCAST_CHANNEL_NAME);
  broadcastChannel?.addEventListener('message', (event) => {
    if (event.data === 'refreshing') lastSeenPeerRefreshAt = Date.now();
  });
  return broadcastChannel;
}

// Coordinates the *real* network call across this tab (single-flight) and,
// best-effort, across browser tabs (so two tabs don't race on the same
// rotating refresh cookie). navigator.locks makes the cross-tab part
// airtight where supported; the BroadcastChannel fallback only reduces the
// odds of a collision — the actual safety net is the backend's 10s grace
// window on reused-token detection.
function coordinatedRefresh(): Promise<RefreshResult | null> {
  if (inFlightRefresh) return inFlightRefresh;

  if (typeof navigator !== 'undefined' && 'locks' in navigator) {
    // navigator.locks.request()'s TS typing doesn't unwrap a callback that
    // itself returns a promise cleanly; the Locks API spec guarantees the
    // resolved value is the callback's own resolved value, not a nested
    // promise, so this cast reflects runtime behavior, not a type escape.
    const lockPromise = navigator.locks.request(LOCK_NAME, () => doRawRefresh()) as unknown as Promise<
      RefreshResult | null
    >;
    inFlightRefresh = lockPromise.finally(() => {
      inFlightRefresh = null;
    });
    return inFlightRefresh;
  }

  const channel = getBroadcastChannel();
  const recentPeerActivity = channel !== null && Date.now() - lastSeenPeerRefreshAt < 2000;
  inFlightRefresh = (recentPeerActivity ? new Promise<void>((resolve) => setTimeout(resolve, 300)) : Promise.resolve())
    .then(() => {
      channel?.postMessage('refreshing');
      return doRawRefresh();
    })
    .finally(() => {
      inFlightRefresh = null;
    });
  return inFlightRefresh;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, accessToken: null, status: 'loading' });
  const accessTokenRef = useRef<string | null>(null);

  const applySession = useCallback((accessToken: string | null, user: ApiUser | null) => {
    accessTokenRef.current = accessToken;
    setState({ accessToken, user, status: accessToken ? 'authenticated' : 'anonymous' });
  }, []);

  const refresh = useCallback(async () => {
    const outcome = await refreshWithRetry<RefreshResult>(async () => {
      const data = await coordinatedRefresh();
      return { ok: data !== null, data: data ?? undefined };
    });

    if (!outcome.ok || !outcome.data) {
      applySession(null, null);
      return;
    }

    try {
      const user = await apiFetch<ApiUser>('/auth/me', { accessToken: outcome.data.accessToken });
      applySession(outcome.data.accessToken, user);
    } catch {
      applySession(null, null);
    }
  }, [applySession]);

  useEffect(() => {
    // Session bootstrap: the setState this triggers happens asynchronously
    // after the /auth/refresh round-trip, not synchronously in the effect
    // body — this is the standard fetch-on-mount pattern, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const interval = setInterval(() => void refresh(), AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await apiFetch<LoginResult>('/auth/login', {
        method: 'POST',
        credentials: 'include',
        body: { email, password },
      });
      applySession(result.accessToken, result.user);
    },
    [applySession],
  );

  const register = useCallback(
    async (email: string, password: string, handle: string) => {
      await apiFetch<ApiUser>('/auth/register', { method: 'POST', body: { email, password, handle } });
      await login(email, password);
    },
    [login],
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', {
        method: 'POST',
        credentials: 'include',
        accessToken: accessTokenRef.current ?? undefined,
      });
    } catch {
      // Clear local state regardless — the user asked to log out.
    }
    applySession(null, null);
  }, [applySession]);

  return <AuthContext.Provider value={{ ...state, login, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
