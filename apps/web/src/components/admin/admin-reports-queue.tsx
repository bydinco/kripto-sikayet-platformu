'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '../../lib/api-client';
import type { ApiReport, ReportStatus, ReportStatusCounts } from '../../lib/api-models';
import { RequireRole } from './require-role';
import { StatusBadge } from '../status-badge';
import { formatDate } from '../../lib/format';
import type { Dictionary } from '../../dictionaries/types';
import type { Locale } from '../../lib/locale';

const DEFAULT_STATUSES: ReportStatus[] = ['PENDING', 'NEEDS_EVIDENCE', 'DISPUTED'];
const ALL_STATUSES: ReportStatus[] = [
  'PENDING',
  'NEEDS_EVIDENCE',
  'PUBLISHED',
  'DISPUTED',
  'RESOLVED',
  'REJECTED',
  'REMOVED',
];

function QueueBody({
  accessToken,
  locale,
  dictionary,
}: {
  accessToken: string;
  locale: Locale;
  dictionary: Dictionary;
}) {
  const [selected, setSelected] = useState<ReportStatus[]>(DEFAULT_STATUSES);
  const [counts, setCounts] = useState<ReportStatusCounts | null>(null);
  const [reports, setReports] = useState<ApiReport[] | null>(null);

  useEffect(() => {
    apiFetch<ReportStatusCounts>('/reports/status-counts', { accessToken })
      .then(setCounts)
      .catch(() => setCounts(null));
  }, [accessToken]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReports(null);
    const query = selected.length > 0 ? `?status=${selected.join(',')}&take=50` : '?take=50';
    apiFetch<ApiReport[]>(`/reports${query}`, { accessToken })
      .then(setReports)
      .catch(() => setReports([]));
  }, [accessToken, selected]);

  function toggleStatus(status: ReportStatus) {
    setSelected((current) => (current.includes(status) ? current.filter((s) => s !== status) : [...current, status]));
  }

  return (
    <div className="stack">
      <div className="row">
        {ALL_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            className={selected.includes(status) ? 'button' : 'button button-secondary'}
            onClick={() => toggleStatus(status)}
          >
            {dictionary.statuses[status]}
            {counts ? ` (${counts[status]})` : ''}
          </button>
        ))}
      </div>

      {reports === null ? null : reports.length === 0 ? (
        <p className="muted">{dictionary.admin.reportsQueue.empty}</p>
      ) : (
        reports.map((report) => (
          <Link key={report.id} href={`/${locale}/admin/reports/${report.id}`} className="card" style={{ display: 'block' }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>{report.title}</strong>
              <StatusBadge status={report.status} dictionary={dictionary} />
            </div>
            <p className="muted">{formatDate(report.createdAt, locale)}</p>
          </Link>
        ))
      )}
    </div>
  );
}

export function AdminReportsQueue({ locale, dictionary }: { locale: Locale; dictionary: Dictionary }) {
  return (
    <RequireRole roles={['MODERATOR', 'ADMIN']} locale={locale} dictionary={dictionary}>
      {(accessToken) => <QueueBody accessToken={accessToken} locale={locale} dictionary={dictionary} />}
    </RequireRole>
  );
}
