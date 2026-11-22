import Link from 'next/link';
import type { Metadata } from 'next';
import { apiFetch } from '../../lib/api-client';
import { buildMetadata } from '../../lib/seo';
import { getDictionary } from '../../dictionaries/get-dictionary';
import type { Locale } from '../../lib/locale';
import type { ApiEntity, ApiReport, ApiRiskScore } from '../../lib/api-models';
import { StatusBadge } from '../../components/status-badge';
import { RiskMeter } from '../../components/risk-meter';
import { Pill } from '../../components/pill';
import { humanizeEnum } from '../../lib/format';
import { ENTITY_TYPES } from '../../lib/entity-types';

export async function generateMetadata({ params }: PageProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params;
  const dictionary = getDictionary(locale as Locale);
  return buildMetadata({ locale: locale as Locale, path: '', title: dictionary.siteName, description: dictionary.home.tagline });
}

async function getRecentReports(): Promise<ApiReport[]> {
  try {
    return await apiFetch<ApiReport[]>('/reports?take=10', { next: { revalidate: 600 } });
  } catch {
    return [];
  }
}

// Capped at the backend's own take<=50 limit — a real (if bounded) count
// from the API, never a fabricated number.
async function getPublicReportsForStats(): Promise<ApiReport[]> {
  try {
    return await apiFetch<ApiReport[]>('/reports?take=50', { next: { revalidate: 600 } });
  } catch {
    return [];
  }
}

async function getEntityCount(): Promise<number> {
  try {
    const entities = await apiFetch<ApiEntity[]>('/entities', { next: { revalidate: 600 } });
    return entities.length;
  } catch {
    return 0;
  }
}

async function getTopRiskScores(): Promise<ApiRiskScore[]> {
  try {
    return await apiFetch<ApiRiskScore[]>('/scoring/top?take=6', { next: { revalidate: 300 } });
  } catch {
    return [];
  }
}

function isResolvedThisMonth(report: ApiReport): boolean {
  if (report.status !== 'RESOLVED' || !report.resolvedAt) return false;
  const now = new Date();
  const resolved = new Date(report.resolvedAt);
  return resolved.getUTCFullYear() === now.getUTCFullYear() && resolved.getUTCMonth() === now.getUTCMonth();
}

export default async function LocaleHomePage({ params }: PageProps<'/[locale]'>) {
  const { locale } = (await params) as { locale: Locale };
  const dictionary = getDictionary(locale);
  const [reports, statsReports, entityCount, topRisk] = await Promise.all([
    getRecentReports(),
    getPublicReportsForStats(),
    getEntityCount(),
    getTopRiskScores(),
  ]);

  const resolvedThisMonth = statsReports.filter(isResolvedThisMonth).length;
  const heroEntity = topRisk[0];
  const restOfTopRisk = topRisk.slice(1, 6);

  return (
    <div className="container stack" style={{ paddingTop: 32, paddingBottom: 48 }}>
      <section className="layout-two-col">
        <div className="stack">
          <span className="pill pill-ac">{dictionary.home.heroEyebrow}</span>
          <h1>{dictionary.siteName}</h1>
          <p className="muted">{dictionary.home.tagline}</p>
          <form action={`/${locale}/entities`} className="row">
            <input className="input" type="text" name="q" placeholder={dictionary.home.searchPlaceholder} />
            <button className="button" type="submit">
              {dictionary.home.searchButton}
            </button>
          </form>
          <div className="row">
            {ENTITY_TYPES.slice(0, 6).map((type) => (
              <Link key={type} href={`/${locale}/entities?type=${type}`} className="pill pill-ne">
                {humanizeEnum(type)}
              </Link>
            ))}
          </div>
        </div>

        <div className="card stack">
          {!heroEntity || heroEntity.score === null ? (
            <p className="muted">{dictionary.home.scoresNotLiveYet}</p>
          ) : (
            <>
              <span className="muted">{dictionary.home.topRiskTitle}</span>
              <Link href={`/${locale}/entities/${heroEntity.entity?.slug}`} style={{ fontWeight: 700, fontSize: '1.125rem' }}>
                {heroEntity.entity?.name}
              </Link>
              <RiskMeter score={heroEntity.score} />
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="numeric" style={{ fontSize: '1.5rem' }}>
                  {heroEntity.score}/100
                </span>
                <Pill variant={heroEntity.level === 'CRITICAL_SIGNAL' ? 'co' : 'wa'}>
                  {dictionary.riskLevels[heroEntity.level]}
                </Pill>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="row" style={{ gap: 24 }}>
        <div className="card" style={{ flex: 1 }}>
          <div className="muted">{dictionary.home.statTotalReports}</div>
          <div className="numeric" style={{ fontSize: '1.75rem' }}>
            {statsReports.length}
          </div>
        </div>
        <div className="card" style={{ flex: 1 }}>
          <div className="muted">{dictionary.home.statEntities}</div>
          <div className="numeric" style={{ fontSize: '1.75rem' }}>
            {entityCount}
          </div>
        </div>
        <div className="card" style={{ flex: 1 }}>
          <div className="muted">{dictionary.home.statPublished}</div>
          <div className="numeric" style={{ fontSize: '1.75rem' }}>
            {resolvedThisMonth}
          </div>
        </div>
      </section>

      <section className="stack">
        <h2>{dictionary.home.topRiskTitle}</h2>
        {restOfTopRisk.length === 0 ? (
          <p className="muted">{dictionary.home.topRiskEmpty}</p>
        ) : (
          <div>
            {restOfTopRisk.map((score) => (
              <Link
                key={score.id}
                href={`/${locale}/entities/${score.entity?.slug}`}
                className="card"
                style={{ display: 'block' }}
              >
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>{score.entity?.name}</strong>
                  <Pill variant={score.level === 'CRITICAL_SIGNAL' ? 'co' : 'wa'}>{dictionary.riskLevels[score.level]}</Pill>
                </div>
                <RiskMeter score={score.score} sm />
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="stack">
        <h2>{dictionary.home.recentReportsTitle}</h2>
        {reports.length === 0 ? (
          <p className="muted">{dictionary.home.noRecentReports}</p>
        ) : (
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
        )}
      </section>

      <section className="card stack">
        <h2>{dictionary.home.howItWorksTitle}</h2>
        <div className="row" style={{ gap: 24, alignItems: 'flex-start' }}>
          {dictionary.home.howItWorksSteps.map((step, index) => (
            <div key={index} className="stack" style={{ flex: 1, minWidth: 200 }}>
              <span className="numeric" style={{ fontSize: '1.5rem' }}>
                {index + 1}
              </span>
              <p className="muted">{step}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="stack">
        <h2>{dictionary.home.browseByTypeTitle}</h2>
        <div className="row">
          {ENTITY_TYPES.map((type) => (
            <Link key={type} href={`/${locale}/entities?type=${type}`} className="pill pill-ne">
              {humanizeEnum(type)}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
