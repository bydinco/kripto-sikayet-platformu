'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useAuth } from '../lib/auth-context';
import { apiFetch, ApiError } from '../lib/api-client';
import { formatDate } from '../lib/format';
import type { ApiComment, ApiEngagement } from '../lib/api-models';
import type { Dictionary } from '../dictionaries/types';
import type { Locale } from '../lib/locale';

const COMMENT_MAX_LENGTH = 1000;
const COMMENT_MIN_LENGTH = 2;

export function ReportEngagement({
  reportId,
  reportAuthorId,
  locale,
  dictionary,
  initialSummary,
  initialComments,
}: {
  reportId: string;
  reportAuthorId: string;
  locale: Locale;
  dictionary: Dictionary;
  initialSummary: ApiEngagement;
  initialComments: ApiComment[];
}) {
  const { status, accessToken, user } = useAuth();
  const [summary, setSummary] = useState<ApiEngagement>(initialSummary);
  const [comments, setComments] = useState<ApiComment[]>(initialComments);
  const [commentBody, setCommentBody] = useState('');
  const [voteBusy, setVoteBusy] = useState(false);
  const [meTooBusy, setMeTooBusy] = useState(false);
  const [commentBusy, setCommentBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOwnReport = status === 'authenticated' && user?.id === reportAuthorId;

  // Only an authenticated viewer has a "mine" state at all — the engagement
  // summary passed from the server never carries myHelpful/myMeToo (there's
  // no SSR session, see CLAUDE.md auth architecture), so this fills it in
  // client-side once we actually have an access token.
  useEffect(() => {
    if (status !== 'authenticated' || !accessToken) return;
    apiFetch<ApiEngagement>(`/reports/${reportId}/engagement`, { accessToken })
      .then(setSummary)
      .catch(() => {
        // Keep the SSR counts rather than showing nothing.
      });
  }, [status, accessToken, reportId]);

  const loginHref = `/${locale}/login?next=/${locale}/reports/${reportId}`;

  async function toggleHelpful() {
    if (!accessToken) return;
    setError(null);
    const next = !summary.myHelpful;
    setVoteBusy(true);
    setSummary((s) => ({ ...s, myHelpful: next, helpfulCount: s.helpfulCount + (next ? 1 : -1) }));
    try {
      if (next) {
        await apiFetch(`/reports/${reportId}/votes`, { method: 'POST', accessToken });
      } else {
        await apiFetch(`/reports/${reportId}/votes`, { method: 'DELETE', accessToken });
      }
    } catch (err) {
      setSummary((s) => ({ ...s, myHelpful: !next, helpfulCount: s.helpfulCount + (next ? -1 : 1) }));
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setVoteBusy(false);
    }
  }

  async function toggleMeToo() {
    if (!accessToken) return;
    setError(null);
    const next = !summary.myMeToo;
    setMeTooBusy(true);
    setSummary((s) => ({ ...s, myMeToo: next, meTooCount: s.meTooCount + (next ? 1 : -1) }));
    try {
      if (next) {
        await apiFetch(`/reports/${reportId}/me-too`, { method: 'POST', accessToken, body: {} });
      } else {
        await apiFetch(`/reports/${reportId}/me-too`, { method: 'DELETE', accessToken });
      }
    } catch (err) {
      setSummary((s) => ({ ...s, myMeToo: !next, meTooCount: s.meTooCount + (next ? -1 : 1) }));
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setMeTooBusy(false);
    }
  }

  async function submitComment(event: FormEvent) {
    event.preventDefault();
    if (!accessToken) return;
    setError(null);
    setCommentBusy(true);
    try {
      const comment = await apiFetch<ApiComment>(`/reports/${reportId}/comments`, {
        method: 'POST',
        accessToken,
        body: { body: commentBody },
      });
      setComments((list) => [...list, comment]);
      setSummary((s) => ({ ...s, commentCount: s.commentCount + 1 }));
      setCommentBody('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setCommentBusy(false);
    }
  }

  async function removeComment(commentId: string) {
    if (!accessToken) return;
    setError(null);
    try {
      await apiFetch(`/reports/${reportId}/comments/${commentId}`, { method: 'DELETE', accessToken, body: {} });
      setComments((list) => list.filter((c) => c.id !== commentId));
      setSummary((s) => ({ ...s, commentCount: Math.max(0, s.commentCount - 1) }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }

  const trimmedLength = commentBody.trim().length;
  const commentValid = trimmedLength >= COMMENT_MIN_LENGTH && commentBody.length <= COMMENT_MAX_LENGTH;

  return (
    <div className="stack">
      <div className="row">
        {isOwnReport ? (
          <p className="muted">{dictionary.reportDetail.ownReportNotice}</p>
        ) : status === 'authenticated' ? (
          <>
            <button
              type="button"
              className="button button-secondary"
              aria-pressed={summary.myHelpful}
              disabled={voteBusy}
              onClick={() => void toggleHelpful()}
            >
              {dictionary.reportDetail.helpfulButton} · {summary.helpfulCount}
            </button>
            <button
              type="button"
              className="button button-secondary"
              aria-pressed={summary.myMeToo}
              disabled={meTooBusy}
              onClick={() => void toggleMeToo()}
            >
              {dictionary.reportDetail.meTooButton} · {summary.meTooCount}
            </button>
          </>
        ) : (
          <>
            <span className="muted">
              {summary.helpfulCount} {dictionary.reportDetail.helpfulCountLabel}
            </span>
            <span className="muted">
              {summary.meTooCount} {dictionary.reportDetail.meTooCountLabel}
            </span>
            <Link href={loginHref} className="button button-secondary">
              {dictionary.reportForm.goToLogin}
            </Link>
          </>
        )}
      </div>
      {error ? <p className="error-text">{error}</p> : null}

      <div className="stack">
        <h2>
          {dictionary.reportDetail.commentsTitle} · {summary.commentCount}
        </h2>
        {comments.length === 0 ? (
          <p className="muted">{dictionary.reportDetail.noComments}</p>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="card stack">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span>
                  <strong>{comment.author.handle}</strong>
                  {comment.isReportAuthor ? <span className="badge">{dictionary.reportDetail.reportAuthorBadge}</span> : null}
                  {comment.isMeToo ? <span className="badge">{dictionary.reportDetail.meTooButton}</span> : null}
                </span>
                <span className="muted">{formatDate(comment.createdAt, locale)}</span>
              </div>
              {comment.body ? <p style={{ whiteSpace: 'pre-wrap' }}>{comment.body}</p> : null}
              {status === 'authenticated' && user?.handle === comment.author.handle ? (
                <button type="button" className="button button-secondary" onClick={() => void removeComment(comment.id)}>
                  {dictionary.reportDetail.commentDeleteButton}
                </button>
              ) : null}
            </div>
          ))
        )}
        <p className="muted">{dictionary.reportDetail.commentOpinionNotice}</p>

        {status === 'authenticated' ? (
          <form onSubmit={submitComment} className="stack">
            <div className="field">
              <label htmlFor="comment-body">{dictionary.reportDetail.commentsTitle}</label>
              <textarea
                id="comment-body"
                className="textarea"
                value={commentBody}
                maxLength={COMMENT_MAX_LENGTH}
                placeholder={dictionary.reportDetail.commentPlaceholder}
                onChange={(e) => setCommentBody(e.target.value)}
              />
              <span className="muted">
                {commentBody.length}/{COMMENT_MAX_LENGTH}
              </span>
            </div>
            <button type="submit" className="button" disabled={!commentValid || commentBusy}>
              {dictionary.reportDetail.commentSubmit}
            </button>
          </form>
        ) : (
          <Link href={loginHref} className="button button-secondary">
            {dictionary.reportForm.goToLogin}
          </Link>
        )}
      </div>
    </div>
  );
}
