import { revalidatePath, revalidateTag } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';

// Protected on-demand revalidation. The API calls this after events that
// change what a cached page would show (report status transitions, risk
// model activate/deactivate, recomputeScore, Notice decisions) — see
// CLAUDE.md's "On-demand revalidation" section for the tag/path mapping.
//
// Never public: REVALIDATE_SECRET is a server-only env var (no NEXT_PUBLIC_
// prefix), checked via a header, not a query string (query strings end up
// in logs/history).
export async function POST(request: NextRequest) {
  const expected = process.env.REVALIDATE_SECRET;
  if (!expected) {
    // Misconfiguration, not a client error — fail closed either way.
    return NextResponse.json({ error: 'REVALIDATE_SECRET not configured' }, { status: 500 });
  }

  const provided = request.headers.get('x-revalidate-secret');
  if (provided !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);
  const paths = isStringArray((body as Record<string, unknown> | null)?.paths) ? (body as { paths: string[] }).paths : [];
  const tags = isStringArray((body as Record<string, unknown> | null)?.tags) ? (body as { tags: string[] }).tags : [];

  if (paths.length === 0 && tags.length === 0) {
    return NextResponse.json({ error: 'paths or tags required' }, { status: 400 });
  }

  for (const path of paths) revalidatePath(path);
  // Next 16 requires a second argument: a cacheLife profile name or an
  // { expire } override. { expire: 0 } means "stale immediately" — the
  // whole point of an on-demand revalidation webhook.
  for (const tag of tags) revalidateTag(tag, { expire: 0 });

  return NextResponse.json({ revalidated: true, paths, tags });
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}
