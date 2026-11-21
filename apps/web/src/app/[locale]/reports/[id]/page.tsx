import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { apiFetch } from '../../../../lib/api-client';
import { buildMetadata } from '../../../../lib/seo';
import { getDictionary } from '../../../../dictionaries/get-dictionary';
import type { Locale } from '../../../../lib/locale';
import type { ApiEntity, ApiEntityResponse, ApiEvidence, ApiReport } from '../../../../lib/api-models';
import { formatDate } from '../../../../lib/format';
import { StatusBadge } from '../../../../components/status-badge';

async function getReport(id: string): Promise<ApiReport | null> {
  try {
    return await apiFetch<ApiReport>(`/reports/${encodeURIComponent(id)}`, { next: { revalidate: 300 } });
  } catch {
    return null;
  }
}

async function getEntity(entityId: string): Promise<ApiEntity | null> {
  try {
    return await apiFetch<ApiEntity>(`/entities/${encodeURIComponent(entityId)}`, { next: { revalidate: 600 } });
  } catch {
    return null;
  }
}

async function getEvidence(reportId: string): Promise<ApiEvidence[]> {
  try {
    return await apiFetch<ApiEvidence[]>(`/evidence?reportId=${encodeURIComponent(reportId)}`, {
      next: { revalidate: 300 },
    });
  } catch {
    return [];
  }
}

async function getResponses(reportId: string): Promise<ApiEntityResponse[]> {
  try {
    return await apiFetch<ApiEntityResponse[]>(`/reports/${encodeURIComponent(reportId)}/responses`, {
      next: { revalidate: 300 },
    });
  } catch {
    return [];
  }
}

// Only ever render a LINK evidence value as a clickable anchor when it's
// genuinely http(s) — the backend already enforces this at creation time,
// this is a second, independent check at render time.
function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function generateMetadata({ params }: PageProps<'/[locale]/reports/[id]'>): Promise<Metadata> {
  const { locale, id } = (await params) as { locale: Locale; id: string };
  const dictionary = getDictionary(locale);
  const report = await getReport(id);
  if (!report) {
    return buildMetadata({ locale, path: `/reports/${id}`, title: dictionary.siteName, description: '', noindex: true });
  }
  return buildMetadata({
    locale,
    path: `/reports/${report.id}`,
    title: `${report.title} — ${dictionary.siteName}`,
    description: report.body.slice(0, 160),
  });
}

export default async function ReportDetailPage({ params }: PageProps<'/[locale]/reports/[id]'>) {
  const { locale, id } = (await params) as { locale: Locale; id: string };
  const dictionary = getDictionary(locale);
  const report = await getReport(id);
  if (!report) notFound();

  const [entity, evidence, responses] = await Promise.all([
    getEntity(report.entityId),
    getEvidence(report.id),
    getResponses(report.id),
  ]);

  return (
    <div className="container stack" style={{ paddingTop: 32, paddingBottom: 48 }}>
      <div className="stack">
        {entity ? (
          <Link href={`/${locale}/entities/${entity.slug}`} className="muted">
            {entity.name}
          </Link>
        ) : null}
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h1>{report.title}</h1>
          <StatusBadge status={report.status} dictionary={dictionary} />
        </div>
        <p className="muted">{dictionary.categories[report.category]}</p>
        {/* Plain-text rendering only — never dangerouslySetInnerHTML for user content. */}
        <p style={{ whiteSpace: 'pre-wrap' }}>{report.body}</p>
        <div className="row">
          {report.lossUsd ? (
            <span className="muted">
              {dictionary.reportDetail.lossLabel}: ${report.lossUsd}
            </span>
          ) : null}
          {report.incidentAt ? (
            <span className="muted">
              {dictionary.reportDetail.incidentDateLabel}: {formatDate(report.incidentAt, locale)}
            </span>
          ) : null}
        </div>
        {report.status === 'RESOLVED' && report.satisfactionRating ? (
          <p>
            {dictionary.reportDetail.satisfactionLabel}: {report.satisfactionRating}/5
          </p>
        ) : null}
      </div>

      <div className="stack">
        <h2>{dictionary.reportDetail.evidenceTitle}</h2>
        {evidence.length === 0 ? (
          <p className="muted">{dictionary.reportDetail.noEvidence}</p>
        ) : (
          evidence.map((item) => (
            <div key={item.id} className="card">
              <span className="muted">{item.type}</span>{' '}
              {item.type === 'LINK' && item.value && isSafeHttpUrl(item.value) ? (
                <a href={item.value} target="_blank" rel="ugc nofollow noopener noreferrer">
                  {item.value}
                </a>
              ) : (
                <span>{item.value}</span>
              )}
            </div>
          ))
        )}
      </div>

      <div className="stack">
        <h2>{dictionary.reportDetail.responsesTitle}</h2>
        {responses.length === 0 ? (
          <p className="muted">{dictionary.reportDetail.noResponses}</p>
        ) : (
          responses.map((response) => (
            <div key={response.id} className="card stack">
              {response.isDispute ? <span className="badge">{dictionary.reportDetail.disputedBadge}</span> : null}
              <p style={{ whiteSpace: 'pre-wrap' }}>{response.body}</p>
              <span className="muted">{formatDate(response.createdAt, locale)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
