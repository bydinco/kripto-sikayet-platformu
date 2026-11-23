import type { ApiErrorBody } from './api-models';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody | undefined;

  constructor(status: number, message: string, body?: ApiErrorBody) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function throwApiError(response: Response): Promise<never> {
  let parsedBody: ApiErrorBody | undefined;
  try {
    parsedBody = await response.json();
  } catch {
    // No JSON body (e.g. a plain 500) — fall through with no parsed body.
  }
  const rawMessage = parsedBody?.message;
  const message = Array.isArray(rawMessage)
    ? rawMessage.join(', ')
    : rawMessage ?? `İstek başarısız oldu (${response.status}).`;
  throw new ApiError(response.status, message, parsedBody);
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  accessToken?: string;
  body?: unknown;
  /** Forwarded to fetch's `credentials`; only needed for the auth endpoints
   * that read/set the httpOnly refresh cookie. */
}

// Thin wrapper: base URL + JSON headers + Bearer token + API error surfacing.
// Works from both the browser and Next.js server components (same API URL
// in dev; a reverse proxy makes it the same public host in production).
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { accessToken, headers, body, ...rest } = options;

  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    await throwApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

// Multipart upload (evidence screenshots) — deliberately not apiFetch: the
// browser must set its own multipart boundary in Content-Type, so FormData
// is sent as-is rather than JSON-stringified.
export async function apiUploadFile<T>(path: string, file: File, accessToken: string): Promise<T> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });

  if (!response.ok) {
    await throwApiError(response);
  }
  return (await response.json()) as T;
}

// GET /evidence/:id/file requires auth headers for non-public evidence,
// which an <img src> can't send — fetched as a Blob and rendered via a
// local object URL instead (see EvidenceFilePreview).
export async function apiFetchBlob(path: string, accessToken?: string): Promise<Blob> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.blob();
}

// Public, unauthenticated URL for an approved evidence file on a publicly
// visible report — safe to use directly as an <img src>, no JS required.
export function evidenceFileUrl(evidenceId: string): string {
  return `${API_URL}/evidence/${encodeURIComponent(evidenceId)}/file`;
}
