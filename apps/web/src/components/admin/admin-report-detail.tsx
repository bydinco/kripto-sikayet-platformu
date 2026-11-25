'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { apiFetch, apiFetchBlob, ApiError } from '../../lib/api-client';
import type {
  ApiComment,
  ApiEntityResponse,
  ApiEvidence,
  ApiModerationLog,
  ApiReport,
  ApiReportStatusHistory,
  ReportStatus,
} from '../../lib/api-models';
import { RequireRole } from './require-role';
import { StatusBadge } from '../status-badge';
import { formatDate } from '../../lib/format';
import type { Dictionary } from '../../dictionaries/types';
import type { Locale } from '../../lib/locale';

// Second, independent check at render time — the backend already enforces
// LINK evidence must be http(s) at creation.
function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

interface TimelineEntry {
  createdAt: string;
  detail: string;
}

// GET /evidence/:id/file needs an Authorization header for unapproved
// evidence (e.g. before the report is published), which a plain <img src>
// can't send — fetched as a Blob and rendered via a local object URL.
function EvidenceFilePreview({
  evidenceId,
  accessToken,
  dictionary,
}: {
  evidenceId: string;
  accessToken: string;
  dictionary: Dictionary;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let currentUrl: string | null = null;
    apiFetchBlob(`/evidence/${evidenceId}/file`, accessToken)
      .then((blob) => {
        currentUrl = URL.createObjectURL(blob);
        setObjectUrl(currentUrl);
      })
      .catch(() => setFailed(true));
    return () => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [evidenceId, accessToken]);

  if (failed) return <p className="muted">{dictionary.admin.reportDetail.filePreviewUnavailable}</p>;
  if (!objectUrl) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- blob: object URL, not a remote/optimizable asset
    <img
      src={objectUrl}
      alt={dictionary.admin.reportDetail.filePreviewAlt}
      style={{ maxWidth: 200, maxHeight: 200, borderRadius: 8, display: 'block' }}
    />
  );
}

// Inline reason input for HIDE_COMMENT — kept as its own small component so
// each comment's draft reason is local state, not one shared string for
// the whole list.
function HideCommentControl({
  commentId,
  accessToken,
  reportId,
  dictionary,
  onHidden,
}: {
  commentId: string;
  accessToken: string;
  reportId: string;
  dictionary: Dictionary;
  onHidden: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button type="button" className="button button-secondary" onClick={() => setOpen(true)}>
        {dictionary.admin.reportDetail.hideButton}
      </button>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiFetch(`/reports/${reportId}/comments/${commentId}`, {
        method: 'DELETE',
        accessToken,
        body: { reason },
      });
      onHidden();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <div className="field">
        <label htmlFor={`hide-reason-${commentId}`}>{dictionary.admin.reportDetail.reasonLabel}</label>
        <textarea
          id={`hide-reason-${commentId}`}
          className="textarea"
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      {error ? <p className="error-text">{error}</p> : null}
      <div className="row">
        <button type="submit" className="button" disabled={busy}>
          {dictionary.admin.reportDetail.hideSubmit}
        </button>
        <button type="button" className="button button-secondary" onClick={() => setOpen(false)}>
          ×
        </button>
      </div>
    </form>
  );
}

function Body({
  id,
  accessToken,
  locale,
  dictionary,
}: {
  id: string;
  accessToken: string;
  locale: Locale;
  dictionary: Dictionary;
}) {
  const [report, setReport] = useState<ApiReport | null>(null);
  const [evidence, setEvidence] = useState<ApiEvidence[]>([]);
  const [responses, setResponses] = useState<ApiEntityResponse[]>([]);
  const [comments, setComments] = useState<ApiComment[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [nextStatus, setNextStatus] = useState<ReportStatus | ''>('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [reportRes, evidenceRes, responsesRes, commentsRes, historyRes, logsRes] = await Promise.all([
      apiFetch<ApiReport>(`/reports/${id}`, { accessToken }),
      apiFetch<ApiEvidence[]>(`/evidence?reportId=${id}`, { accessToken }),
      apiFetch<ApiEntityResponse[]>(`/reports/${id}/responses`, { accessToken }),
      apiFetch<ApiComment[]>(`/reports/${id}/comments?limit=50`, { accessToken }),
      apiFetch<ApiReportStatusHistory[]>(`/reports/${id}/status-history`, { accessToken }),
      apiFetch<ApiModerationLog[]>(`/moderation?reportId=${id}`, { accessToken }),
    ]);
    setReport(reportRes);
    setEvidence(evidenceRes);
    setResponses(responsesRes);
    setComments(commentsRes);
    setTimeline(
      [
        ...historyRes.map((h) => ({
          createdAt: h.createdAt,
          detail: `${dictionary.statuses[h.fromStatus]} → ${dictionary.statuses[h.toStatus]} (${h.actorType}${h.reason ? `: ${h.reason}` : ''})`,
        })),
        ...logsRes.map((l) => ({
          createdAt: l.createdAt,
          detail: `${l.action}${l.reason ? `: ${l.reason}` : ''}`,
        })),
      ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    );
    setNextStatus('');
    setReason('');
  }, [id, accessToken, dictionary]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function setEvidenceApproval(evidenceId: string, approved: boolean) {
    setError(null);
    try {
      await apiFetch(`/evidence/${evidenceId}`, { method: 'PATCH', accessToken, body: { approved } });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }

  async function submitTransition(event: FormEvent) {
    event.preventDefault();
    if (!nextStatus) return;
    setError(null);
    setBusy(true);
    try {
      await apiFetch(`/reports/${id}`, { method: 'PATCH', accessToken, body: { status: nextStatus, reason } });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!report) return null;

  return (
    <div className="stack">
      <Link href={`/${locale}/admin/reports`} className="muted">
        ← {dictionary.admin.reportDetail.backToQueue}
      </Link>

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>{report.title}</h1>
        <StatusBadge status={report.status} dictionary={dictionary} />
      </div>
      <p className="muted">{dictionary.categories[report.category]}</p>
      <p style={{ whiteSpace: 'pre-wrap' }}>{report.body}</p>

      <div className="stack">
        <h2>{dictionary.admin.reportDetail.evidenceTitle}</h2>
        {evidence.map((item) => (
          <div key={item.id} className="card row" style={{ justifyContent: 'space-between' }}>
            <span>
              <span className="muted">{item.type}</span>{' '}
              {item.type === 'SCREENSHOT' && item.storageKey ? (
                <EvidenceFilePreview evidenceId={item.id} accessToken={accessToken} dictionary={dictionary} />
              ) : item.type === 'LINK' && item.value && isSafeHttpUrl(item.value) ? (
                <a href={item.value} target="_blank" rel="ugc nofollow noopener noreferrer">
                  {item.value}
                </a>
              ) : (
                <span>{item.value}</span>
              )}{' '}
              {!item.approved ? <span className="badge">{dictionary.admin.reportDetail.unapprovedBadge}</span> : null}
            </span>
            {item.approved ? (
              <button type="button" className="button button-secondary" onClick={() => void setEvidenceApproval(item.id, false)}>
                {dictionary.admin.reportDetail.rejectButton}
              </button>
            ) : (
              <button type="button" className="button" onClick={() => void setEvidenceApproval(item.id, true)}>
                {dictionary.admin.reportDetail.approveButton}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="stack">
        <h2>{dictionary.admin.reportDetail.responsesTitle}</h2>
        {responses.length === 0 ? (
          <p className="muted">{dictionary.admin.reportDetail.noResponses}</p>
        ) : (
          responses.map((response) => (
            <div key={response.id} className="card stack">
              <p style={{ whiteSpace: 'pre-wrap' }}>{response.body}</p>
              <span className="muted">{formatDate(response.createdAt, locale)}</span>
            </div>
          ))
        )}
      </div>

      <div className="stack">
        <h2>{dictionary.admin.reportDetail.commentsTitle}</h2>
        {comments.length === 0 ? (
          <p className="muted">{dictionary.admin.reportDetail.noComments}</p>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="card stack">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span>
                  <strong>{comment.author.handle}</strong> · {comment.isMeToo ? 'me-too' : 'comment'}
                </span>
                <span className="muted">{formatDate(comment.createdAt, locale)}</span>
              </div>
              {comment.body ? <p style={{ whiteSpace: 'pre-wrap' }}>{comment.body}</p> : null}
              <HideCommentControl
                commentId={comment.id}
                reportId={id}
                accessToken={accessToken}
                dictionary={dictionary}
                onHidden={() => void load()}
              />
            </div>
          ))
        )}
      </div>

      <div className="stack">
        <h2>{dictionary.admin.reportDetail.timelineTitle}</h2>
        {timeline.map((entry, index) => (
          <div key={index} className="row" style={{ justifyContent: 'space-between' }}>
            <span>{entry.detail}</span>
            <span className="muted">{formatDate(entry.createdAt, locale)}</span>
          </div>
        ))}
      </div>

      <div className="stack card">
        <h2>{dictionary.admin.reportDetail.transitionTitle}</h2>
        {!report.allowedTransitions || report.allowedTransitions.length === 0 ? (
          <p className="muted">{dictionary.admin.reportDetail.noTransitions}</p>
        ) : (
          <form onSubmit={submitTransition} className="stack">
            <select
              className="select"
              value={nextStatus}
              onChange={(e) => setNextStatus(e.target.value as ReportStatus)}
            >
              <option value="">—</option>
              {report.allowedTransitions.map((status) => (
                <option key={status} value={status}>
                  {dictionary.statuses[status]}
                </option>
              ))}
            </select>
            <div className="field">
              <label htmlFor="reason">{dictionary.admin.reportDetail.reasonLabel}</label>
              <textarea id="reason" className="textarea" required value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            {error ? <p className="error-text">{error}</p> : null}
            <button type="submit" className="button" disabled={!nextStatus || busy}>
              {dictionary.admin.reportDetail.submitTransition}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export function AdminReportDetail({ id, locale, dictionary }: { id: string; locale: Locale; dictionary: Dictionary }) {
  return (
    <RequireRole roles={['MODERATOR', 'ADMIN']} locale={locale} dictionary={dictionary}>
      {(accessToken) => <Body id={id} accessToken={accessToken} locale={locale} dictionary={dictionary} />}
    </RequireRole>
  );
}
