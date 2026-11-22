import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { apiFetch } from '../../../../lib/api-client';
import { buildMetadata } from '../../../../lib/seo';
import { getDictionary } from '../../../../dictionaries/get-dictionary';
import type { Locale } from '../../../../lib/locale';
import type { ApiEntity, ApiReport, ApiRiskScore } from '../../../../lib/api-models';
import { formatPercent, humanizeEnum } from '../../../../lib/format';
import { StatusBadge } from '../../../../components/status-badge';

async function getEntity(idOrSlug: string): Promise<ApiEntity | null> {
  try {
    return await apiFetch<ApiEntity>(`/entities/${encodeURIComponent(idOrSlug)}`, { next: { revalidate: 600 } });
  } catch {
    return null;
  }
}

async function getEntityReports(entityId: string): Promise<ApiReport[]> {
  try {
    return await apiFetch<ApiReport[]>(`/reports?entityId=${entityId}&take=50`, { next: { revalidate: 600 } });
  } catch {
    return [];
  }
}

// Visibility is enforced server-side (apps/api ScoringService): a public,
// unauthenticated fetch here only ever gets a score back when its model
// is active.
async function getLatestRiskScore(entityId: string): Promise<ApiRiskScore | null> {
  try {
    const scores = await apiFetch<ApiRiskScore[]>(`/scoring?entityId=${entityId}`, { next: { revalidate: 300 } });
    return scores[0] ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps<'/[locale]/entities/[slug]'>): Promise<Metadata> {
  const { locale, slug } = (await params) as { locale: Locale; slug: string };
  const dictionary = getDictionary(locale);
  const entity = await getEntity(slug);

  if (!entity) {
    return buildMetadata({ locale, path: `/entities/${slug}`, title: dictionary.siteName, description: '', noindex: true });
  }

  const reports = await getEntityReports(entity.id);
  return buildMetadata({
    locale,
    path: `/entities/${entity.slug}`,
    title: `${entity.name} — ${dictionary.siteName}`,
    description: entity.summary ?? dictionary.home.tagline,
    // Thin pages (no public reports yet) aren't worth indexing.
    noindex: reports.length === 0,
  });
}

export default async function EntityDetailPage({ params }: PageProps<'/[locale]/entities/[slug]'>) {
  const { locale, slug } = (await params) as { locale: Locale; slug: string };
  const dictionary = getDictionary(locale);
  const entity = await getEntity(slug);
  if (!entity) notFound();

  const [reports, riskScore] = await Promise.all([getEntityReports(entity.id), getLatestRiskScore(entity.id)]);

  return (
    <div className="container stack" style={{ paddingTop: 32, paddingBottom: 48 }}>
      <div className="stack">
        <h1>{entity.name}</h1>
        <p className="muted">{humanizeEnum(entity.type)}</p>
        {entity.summary ? <p>{entity.summary}</p> : null}
      </div>

      <div className="card stack">
        <h2>{dictionary.entityDetail.scoreTitle}</h2>
        {!riskScore ? (
          <p className="muted">{dictionary.entityDetail.noModel}</p>
        ) : riskScore.level === 'INSUFFICIENT_DATA' || riskScore.score === null ? (
          <p className="muted">{dictionary.entityDetail.insufficientData}</p>
        ) : (
          <div className="stack">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong style={{ fontSize: '1.5rem' }}>{riskScore.score}/100</strong>
              <span className="badge">{dictionary.riskLevels[riskScore.level]}</span>
            </div>
            <p className="muted">
              {dictionary.entityDetail.confidenceLabel}: {riskScore.confidence}%
            </p>
            <div className="stack">
              <h3>{dictionary.entityDetail.whyThisScore}</h3>
              {riskScore.factors.length === 0 ? (
                <p className="muted">{dictionary.entityDetail.noFactors}</p>
              ) : (
                riskScore.factors.map((f) => (
                  <div key={f.id} className="row" style={{ justifyContent: 'space-between' }}>
                    <span>{f.factor.name}</span>
                    <span className="muted">{f.rawValue}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        <Link href={`/${locale}/methodology`} className="muted">
          {dictionary.entityDetail.methodologyLink}
        </Link>
        <p className="muted" style={{ fontSize: '0.8125rem' }}>
          {dictionary.entityDetail.disclaimer}
        </p>
      </div>

      <div className="card stack">
        <h2>{dictionary.entityDetail.statsTitle}</h2>
        {entity.stats ? (
          <div className="row" style={{ gap: 32 }}>
            <div>
              <div className="muted">{dictionary.entityDetail.responseRate}</div>
              <strong>{formatPercent(entity.stats.responseRatePct)}</strong>
            </div>
            <div>
              <div className="muted">{dictionary.entityDetail.resolutionRate}</div>
              <strong>{formatPercent(entity.stats.resolutionRatePct)}</strong>
            </div>
            <div>
              <div className="muted">{dictionary.entityDetail.avgSatisfaction}</div>
              <strong>
                {entity.stats.avgSatisfaction ? `${Number(entity.stats.avgSatisfaction).toFixed(1)}/5` : dictionary.entityDetail.noData}
              </strong>
            </div>
          </div>
        ) : (
          <p className="muted">{dictionary.entityDetail.noData}</p>
        )}
      </div>

      <div className="stack">
        <h2>{dictionary.entityDetail.reportsTitle}</h2>
        {reports.length === 0 ? (
          <p className="muted">{dictionary.entityDetail.noReports}</p>
        ) : (
          <div>
            {reports.map((report) => (
              <Link
                key={report.id}
                href={`/${locale}/reports/${report.id}`}
                className="card"
                style={{ display: 'block' }}
              >
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>{report.title}</strong>
                  <StatusBadge status={report.status} dictionary={dictionary} />
                </div>
                <p className="muted">{dictionary.categories[report.category]}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
