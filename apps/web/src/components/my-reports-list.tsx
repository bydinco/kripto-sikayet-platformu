'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../lib/auth-context';
import { apiFetch } from '../lib/api-client';
import type { ApiReport } from '../lib/api-models';
import { StatusBadge } from './status-badge';
import type { Dictionary } from '../dictionaries/types';
import type { Locale } from '../lib/locale';

export function MyReportsList({ locale, dictionary }: { locale: Locale; dictionary: Dictionary }) {
  const { status, accessToken } = useAuth();
  const [reports, setReports] = useState<ApiReport[] | null>(null);

  useEffect(() => {
    if (status !== 'authenticated' || !accessToken) return;
    apiFetch<ApiReport[]>('/reports/mine', { accessToken })
      .then(setReports)
      .catch(() => setReports([]));
  }, [status, accessToken]);

  if (status === 'loading' || (status === 'authenticated' && reports === null)) return null;

  if (status !== 'authenticated') {
    return (
      <div className="card stack">
        <p>{dictionary.reportForm.loginRequired}</p>
        <Link href={`/${locale}/login?next=/${locale}/reports/mine`} className="button">
          {dictionary.reportForm.goToLogin}
        </Link>
      </div>
    );
  }

  if (!reports || reports.length === 0) {
    return <p className="muted">{dictionary.myReports.empty}</p>;
  }

  return (
    <div>
      {reports.map((report) => (
        <Link key={report.id} href={`/${locale}/reports/${report.id}`} className="card" style={{ display: 'block' }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{report.title}</strong>
            <StatusBadge status={report.status} dictionary={dictionary} />
          </div>
          <p className="muted">{dictionary.categories[report.category]}</p>
        </Link>
      ))}
    </div>
  );
}
