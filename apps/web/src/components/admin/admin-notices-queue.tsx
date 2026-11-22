'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../../lib/api-client';
import type { ApiNotice, NoticeStatus } from '../../lib/api-models';
import { RequireRole } from './require-role';
import { formatDate, humanizeEnum } from '../../lib/format';
import type { Dictionary } from '../../dictionaries/types';
import type { Locale } from '../../lib/locale';

const NOTICE_STATUSES: NoticeStatus[] = ['RECEIVED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'COMPLETED'];
const OVERDUE_ELIGIBLE_STATUSES: NoticeStatus[] = ['RECEIVED', 'UNDER_REVIEW'];

function isOverdue(notice: ApiNotice): boolean {
  return (
    Boolean(notice.dueAt) &&
    new Date(notice.dueAt!).getTime() < Date.now() &&
    OVERDUE_ELIGIBLE_STATUSES.includes(notice.status)
  );
}

function NoticeRow({
  notice,
  accessToken,
  locale,
  dictionary,
  onDecided,
}: {
  notice: ApiNotice;
  accessToken: string;
  locale: Locale;
  dictionary: Dictionary;
  onDecided: (updated: ApiNotice) => void;
}) {
  const [status, setStatus] = useState<NoticeStatus>(notice.status);
  const [decision, setDecision] = useState(notice.decision ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const updated = await apiFetch<ApiNotice>(`/notices/${notice.id}`, {
        method: 'PATCH',
        accessToken,
        body: { status, decision: decision.trim() || undefined },
      });
      onDecided(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card stack" style={{ borderColor: isOverdue(notice) ? '#8a2f2f' : undefined }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>{humanizeEnum(notice.type)}</strong>
        {isOverdue(notice) ? <span className="badge">{dictionary.admin.notices.overdueLabel}</span> : null}
      </div>
      <p className="muted">
        {dictionary.admin.notices.submitterLabel}: {notice.submitterName} ({notice.submitterEmail})
      </p>
      <p>
        {dictionary.admin.notices.claimLabel}: {notice.claim}
      </p>
      <p className="muted">
        {formatDate(notice.receivedAt, locale)}
        {notice.dueAt ? ` · ${dictionary.admin.notices.overdueLabel}: ${formatDate(notice.dueAt, locale)}` : ''}
      </p>

      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor={`status-${notice.id}`}>{dictionary.admin.notices.statusLabel}</label>
          <select
            id={`status-${notice.id}`}
            className="select"
            value={status}
            onChange={(e) => setStatus(e.target.value as NoticeStatus)}
          >
            {NOTICE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanizeEnum(s)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor={`decision-${notice.id}`}>{dictionary.admin.notices.decisionLabel}</label>
        <textarea
          id={`decision-${notice.id}`}
          className="textarea"
          value={decision}
          onChange={(e) => setDecision(e.target.value)}
        />
      </div>
      {error ? <p className="error-text">{error}</p> : null}
      <button type="button" className="button" disabled={busy} onClick={() => void submit()}>
        {dictionary.admin.notices.submitDecision}
      </button>
    </div>
  );
}

function QueueBody({ accessToken, locale, dictionary }: { accessToken: string; locale: Locale; dictionary: Dictionary }) {
  const [notices, setNotices] = useState<ApiNotice[] | null>(null);

  useEffect(() => {
    apiFetch<ApiNotice[]>('/notices', { accessToken })
      .then(setNotices)
      .catch(() => setNotices([]));
  }, [accessToken]);

  if (notices === null) return null;
  if (notices.length === 0) return <p className="muted">{dictionary.admin.notices.empty}</p>;

  const sorted = [...notices].sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)));

  return (
    <div className="stack">
      {sorted.map((notice) => (
        <NoticeRow
          key={notice.id}
          notice={notice}
          accessToken={accessToken}
          locale={locale}
          dictionary={dictionary}
          onDecided={(updated) => setNotices((current) => (current ?? []).map((n) => (n.id === updated.id ? updated : n)))}
        />
      ))}
    </div>
  );
}

export function AdminNoticesQueue({ locale, dictionary }: { locale: Locale; dictionary: Dictionary }) {
  return (
    <RequireRole roles={['MODERATOR', 'ADMIN']} locale={locale} dictionary={dictionary}>
      {(accessToken) => <QueueBody accessToken={accessToken} locale={locale} dictionary={dictionary} />}
    </RequireRole>
  );
}
